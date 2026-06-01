/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { Condition, AttrBuilder, AttrRef } from '../shared';
import { createOpBuilder } from '../shared/operators';
import { buildExpression } from '../shared/conditions';
import { buildProjectionExpression } from '../shared/projection';
import { QueryBuilder, QueryExecutor, QueryResult } from './types';
import { KeyDefinition, ModelDefinition } from '../../core/types';
import { extractTemplateVars } from '../../utils/model-utils';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Decide whether an entry in `model.index` belongs to the given index.
 *
 * 1. If the key declaration carries an explicit `indexName`, that wins —
 *    consumers with non-conventional names (e.g. index `BySpotifyId` with
 *    keys `lookupPK`/`lookupSK`) opt in by setting it.
 * 2. Otherwise we fall back to the historical convention but with an EXACT
 *    `<indexName>PK` / `<indexName>SK` suffix check (not `startsWith`), so
 *    sibling indexes whose names share a prefix — `GSI1` vs `GSI10` — don't
 *    cross-pollute key resolution.
 */
function keyBelongsToIndex(
  keyName: string,
  keyDef: KeyDefinition,
  indexName: string
): boolean {
  if (keyDef.indexName !== undefined) {
    return keyDef.indexName === indexName;
  }
  return keyName === `${indexName}PK` || keyName === `${indexName}SK`;
}

/**
 * Internal state for the query builder
 */
type QueryState<Model> = {
  tableName: string;
  client: DynamoDBClient;
  model?: ModelDefinition;
  condition?: Condition;
  indexName?: string;
  limitValue?: number;
  scanForward?: boolean;
  projection?: (keyof Model)[];
  consistentReadEnabled?: boolean;
  exclusiveStartKey?: Record<string, any>;
  logger?: DynamoDBLogger;
  entityType?: string;
  returnConsumedCapacity?: 'INDEXES' | 'TOTAL' | 'NONE';
};

/**
 * Cache of compiled `#<fieldName>\b` regexes used to rewrite a leaf
 * condition's expression when its field maps onto a key. Without this,
 * `separateConditions` allocates a fresh `RegExp` per AND-leaf per query —
 * cheap individually, noisy under load on multi-condition queries.
 */
const fieldPlaceholderRegexCache = new Map<string, RegExp>();
function fieldPlaceholderRegex(fieldName: string): RegExp {
  let re = fieldPlaceholderRegexCache.get(fieldName);
  if (!re) {
    re = new RegExp(`#${fieldName}\\b`, 'g');
    fieldPlaceholderRegexCache.set(fieldName, re);
  }
  return re;
}

/**
 * Maps a model attribute name to its corresponding DynamoDB key name (PK/SK)
 * Also returns the key template for value transformation
 */
function getKeyNameForAttribute(
  fieldName: string,
  model?: ModelDefinition,
  indexName?: string
): { keyName: string; template: string } | null {
  if (!model?.key) return null;

  // When an index is specified, check model.index first for key templates
  if (indexName && model.index) {
    for (const [keyName, keyDef] of Object.entries(model.index)) {
      if (!keyBelongsToIndex(keyName, keyDef, indexName)) {
        continue;
      }
      const templateVars = extractTemplateVars(keyDef.value);
      if (templateVars.includes(fieldName)) {
        return { keyName, template: keyDef.value };
      }
    }
  }

  for (const [keyName, keyDef] of Object.entries(model.key)) {
    const templateVars = extractTemplateVars(keyDef.value);
    if (templateVars.includes(fieldName)) {
      return { keyName, template: keyDef.value };
    }
  }
  return null;
}

/**
 * Apply key template to transform an attribute value to its key value.
 *
 * For multi-variable templates (e.g. "RES#${category}#${code}") we can only fill
 * the variable matching `fieldName`. For `beginsWith` queries we truncate the
 * result at the first remaining `${...}` placeholder so the prefix is usable.
 * For other operators an exact match is required, so we throw a clear error.
 */
function applyKeyTemplate(
  template: string,
  fieldName: string,
  fieldValue: any,
  keyOperator?: string
): string {
  const substituted = template.replace(`\${${fieldName}}`, String(fieldValue));
  const nextPlaceholder = substituted.indexOf('${');
  if (nextPlaceholder === -1) return substituted;

  if (keyOperator === 'beginsWith') {
    return substituted.slice(0, nextPlaceholder);
  }

  throw new Error(
    `Cannot use operator "${keyOperator ?? 'unknown'}" on key template "${template}" ` +
      `with only "${fieldName}" provided — the template still contains unfilled ` +
      `variable(s). Use beginsWith for prefix queries on composite keys.`
  );
}

/**
 * Heuristic for identifying a hash (partition) key by name. Used only to
 * decide whether a literal-template auto-injection covers DynamoDB's
 * "Query needs a partition key" requirement — for actual key resolution
 * we go through {@link keyBelongsToIndex} instead.
 *
 * Convention: primary is literally `PK`; index keys are `${indexName}PK`
 * (conventional) or any `…PK`-suffixed name (non-conventional, opted in
 * via `KeyDefinition.indexName`). The legitimate non-conventional case
 * `BySpotifyId` / `lookupPK` is captured by the `endsWith('PK')` check.
 */
function isHashKeyName(keyName: string, indexName?: string): boolean {
  return indexName ? keyName.endsWith('PK') : keyName === 'PK';
}

/**
 * Collects every key on the active index (or primary) whose template is
 * fully literal — no `${...}` variables. These keys can't be referenced
 * by attribute name in `where()` (there is no template var to bind to),
 * so the query builder synthesizes the equality condition itself.
 *
 * Two real-world patterns this enables:
 *  1. Entity-type partition: `GSI1PK: 'AIRPORT'` with a variable SK —
 *     "give me every Airport, filtered/range-scoped by SK".
 *  2. Singleton sort-key marker: `SK: 'PROFILE'` paired with a variable
 *     PK like `'USER#${userId}'` — auto-injecting SK turns a wasteful
 *     "scan the whole user partition then filter" into a direct lookup.
 */
function getLiteralKeys(
  model?: ModelDefinition,
  indexName?: string
): { keyName: string; value: string }[] {
  if (!model) return [];

  const entries = indexName
    ? Object.entries(model.index ?? {}).filter(([keyName, keyDef]) =>
        keyBelongsToIndex(keyName, keyDef, indexName)
      )
    : Object.entries(model.key);

  return entries
    .filter(([, keyDef]) => extractTemplateVars(keyDef.value).length === 0)
    .map(([keyName, keyDef]) => ({ keyName, value: keyDef.value }));
}

/**
 * Separates a condition tree into key conditions and filter conditions
 * Key conditions are rewritten to use actual DynamoDB key names (PK/SK)
 */
function separateConditions(
  condition: Condition,
  model?: ModelDefinition,
  indexName?: string
): { keyConditions: Condition[]; filterConditions: Condition[] } {
  const keyConditions: Condition[] = [];
  const filterConditions: Condition[] = [];

  function traverse(cond: Condition) {
    // If it's a combinator
    if (cond.operator && cond.children) {
      // For KeyConditionExpression, we can only use AND at the top level
      if (cond.operator === 'AND') {
        cond.children.forEach((child) => {
          // Check if this is a leaf condition or another combinator
          if (child.children) {
            // Nested combinator - goes to filter
            filterConditions.push(child);
          } else {
            traverse(child);
          }
        });
      } else {
        // OR at any level must go to filter
        filterConditions.push(cond);
      }
      return;
    }

    // It's a leaf condition - check if it's a key field. A negated leaf
    // (`op.not(op.eq(attr.x, …))`) can never be a KeyConditionExpression
    // — DynamoDB's KeyConditionExpression grammar has no NOT — and
    // dropping the negation would silently change query semantics. Keep
    // it as a filter so the negation is honored.
    if (cond.isNegated) {
      filterConditions.push(cond);
      return;
    }

    // Extract field name from the expression (e.g., "#username" -> "username")
    const fieldMatch = cond.expression.match(/#(\w+)/);
    if (fieldMatch && fieldMatch[1]) {
      const fieldName = fieldMatch[1];
      const keyInfo = getKeyNameForAttribute(fieldName, model, indexName);

      if (keyInfo) {
        // This is a key field - rewrite the condition to use the actual key name
        // and apply the template to the value

        // Find the value placeholder in the condition and transform it
        const newValues: Record<string, any> = {};
        if (cond.values) {
          for (const [valuePlaceholder, value] of Object.entries(cond.values)) {
            // Apply the key template to transform the value
            const transformedValue = applyKeyTemplate(
              keyInfo.template,
              fieldName,
              value,
              cond.keyOperator
            );
            newValues[valuePlaceholder] = transformedValue;
          }
        }

        const rewrittenCond = {
          ...cond,
          expression: cond.expression.replace(
            fieldPlaceholderRegex(fieldName),
            `#${keyInfo.keyName}`
          ),
          names: {
            [`#${keyInfo.keyName}`]: keyInfo.keyName,
          },
          values: newValues,
        };

        keyConditions.push(rewrittenCond);
      } else {
        filterConditions.push(cond);
      }
    } else {
      // Can't determine field, put in filter to be safe
      filterConditions.push(cond);
    }
  }

  traverse(condition);

  return { keyConditions, filterConditions };
}

/**
 * Builds a simple AND expression from multiple conditions
 */
function buildSimpleAndExpression(conditions: Condition[]): {
  expression: string;
  names: Record<string, string>;
  values: Record<string, any>;
} {
  if (conditions.length === 0) {
    return { expression: '', names: {}, values: {} };
  }

  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, any> = {};

  conditions.forEach((cond) => {
    expressions.push(cond.expression);
    Object.assign(names, cond.names || {});
    Object.assign(values, cond.values || {});
  });

  return {
    expression: expressions.join(' AND '),
    names,
    values,
  };
}

/**
 * Creates the query executor with all query methods
 */
function createQueryExecutor<Model>(state: QueryState<Model>): QueryExecutor<Model> {
  return {
    limit(count) {
      return createQueryExecutor({
        ...state,
        limitValue: count,
      });
    },

    scanIndexForward(forward) {
      return createQueryExecutor({
        ...state,
        scanForward: forward,
      });
    },

    useIndex(indexName) {
      return createQueryExecutor({
        ...state,
        indexName,
      });
    },

    select(attrs) {
      return createQueryExecutor({
        ...state,
        projection: attrs,
      });
    },

    consistentRead() {
      return createQueryExecutor({
        ...state,
        consistentReadEnabled: true,
      });
    },

    startFrom(key) {
      return createQueryExecutor({
        ...state,
        exclusiveStartKey: key,
      });
    },

    returnConsumedCapacity(mode) {
      return createQueryExecutor({
        ...state,
        returnConsumedCapacity: mode,
      });
    },

    dbParams(): QueryCommandInput {
      if (!state.condition) {
        throw new Error('No where condition specified');
      }

      // Separate key conditions from filter conditions
      const { keyConditions, filterConditions } = separateConditions(
        state.condition,
        state.model,
        state.indexName
      );

      // Auto-inject equality conditions for keys whose template is fully
      // literal — they have no `${vars}`, so the user can't reference
      // them via `attr.*` in `where()`. Two real patterns this enables:
      //   1. Entity-type GSI partition: `GSI1PK: 'AIRPORT'` — without
      //      injection DynamoDB rejects the Query for missing the PK.
      //   2. Sort-key marker: `SK: 'PROFILE'` paired with a variable PK
      //      like `'USER#${userId}'` — without injection the query reads
      //      every item under that PK and post-filters by `_type`.
      // The `covered` check is defensive — a literal-template key can't
      // appear in user conditions (no template var to bind) — but cheap
      // protection against future schema shapes.
      const literalKeys = getLiteralKeys(state.model, state.indexName);
      const userKeyConditionCount = keyConditions.length;
      for (const { keyName, value } of literalKeys) {
        const covered = keyConditions.some((cond) =>
          Object.values(cond.names ?? {}).includes(keyName)
        );
        if (covered) continue;
        keyConditions.push({
          expression: `#${keyName} = :${keyName}_literal`,
          names: { [`#${keyName}`]: keyName },
          values: { [`:${keyName}_literal`]: value },
        });
      }

      // DynamoDB Query requires at least a partition-key condition. The
      // friendly error fires when:
      //   - the user's where() contributed zero key conditions, AND
      //   - no auto-injected literal covers the hash key.
      // We can't blindly check `keyConditions.length === 0` after
      // injection because a literal SK alone would silently slip past
      // and produce a less helpful DynamoDB error.
      const literalHashInjected = literalKeys.some(({ keyName }) =>
        isHashKeyName(keyName, state.indexName)
      );
      if (userKeyConditionCount === 0 && !literalHashInjected) {
        const keyTemplates = state.indexName
          ? Object.entries(state.model?.index ?? {})
              .filter(([keyName, def]) =>
                keyBelongsToIndex(keyName, def, state.indexName!)
              )
              .map(([, def]) => def.value)
          : Object.values(state.model?.key ?? {}).map((def) => def.value);
        const templateVars = Array.from(
          new Set(keyTemplates.flatMap((tpl) => extractTemplateVars(tpl)))
        );
        const indexHint = state.indexName ? ` on index "${state.indexName}"` : '';
        const fieldsHint =
          templateVars.length > 0
            ? ` Expected a condition on one of: ${templateVars.join(', ')}.`
            : '';
        throw new Error(
          `Query requires a condition on the partition key${indexHint}.${fieldsHint} ` +
            `For non-key filtering use scan() instead.`
        );
      }

      // Build KeyConditionExpression (simple AND)
      const keyExpr = buildSimpleAndExpression(keyConditions);

      // Auto-inject an entity-type filter so query() only returns items
      // belonging to this entity (single-table designs share PKs across
      // entities, especially on GSIs).
      const allFilters = [...filterConditions];
      if (state.entityType) {
        allFilters.push({
          expression: '#_type = :_type',
          names: { '#_type': '_type' },
          values: { ':_type': state.entityType },
        });
      }

      // Build FilterExpression (can be complex with OR, NOT, etc.)
      let filterExpr = { expression: '', names: {}, values: {} };
      if (allFilters.length > 0) {
        if (allFilters.length === 1 && allFilters[0]) {
          filterExpr = buildExpression(allFilters[0]);
        } else {
          // Multiple filter conditions - combine with AND
          filterExpr = buildExpression({
            expression: '',
            operator: 'AND',
            children: allFilters,
          });
        }
      }

      // Merge attribute names and values from both expressions
      // Build ProjectionExpression with placeholders so reserved words
      // (name, date, status, type, …) don't blow up at DynamoDB.
      // Idempotent merge: filter/key and projection placeholders both map
      // `#name → name`, so collisions resolve to the same value.
      const projection =
        state.projection && state.projection.length > 0
          ? buildProjectionExpression(
              (state.projection as (keyof Model)[]).map((a) => String(a))
            )
          : undefined;

      const allNames: Record<string, string> = {
        ...(keyExpr.names ?? {}),
        ...(filterExpr.names ?? {}),
        ...(projection?.ExpressionAttributeNames ?? {}),
      };
      const allValues = {
        ...(keyExpr.values ?? {}),
        ...(filterExpr.values ?? {}),
      };

      return {
        TableName: state.tableName,
        ...(keyExpr.expression && {
          KeyConditionExpression: keyExpr.expression,
        }),
        ...(filterExpr.expression && {
          FilterExpression: filterExpr.expression,
        }),
        ...(Object.keys(allNames).length && {
          ExpressionAttributeNames: allNames,
        }),
        ...(Object.keys(allValues).length && {
          ExpressionAttributeValues: allValues,
        }),
        ...(state.indexName && { IndexName: state.indexName }),
        ...(state.limitValue && { Limit: state.limitValue }),
        ...(state.scanForward !== undefined && {
          ScanIndexForward: state.scanForward,
        }),
        ...(projection && {
          ProjectionExpression: projection.ProjectionExpression,
        }),
        ...(state.consistentReadEnabled && { ConsistentRead: true }),
        ...(state.exclusiveStartKey && {
          ExclusiveStartKey: state.exclusiveStartKey,
        }),
        ...(state.returnConsumedCapacity && {
          ReturnConsumedCapacity: state.returnConsumedCapacity,
        }),
      };
    },

    /**
     * ⚠️ Returns only the FIRST page of results. DynamoDB caps each Query
     * response at ~1MB (or `Limit` if set). If the matching set is larger,
     * the remaining items are silently dropped.
     *
     * Use {@link executeWithPagination} when you need to drive pagination
     * yourself, or {@link iterate} to walk every matching item lazily.
     */
    async execute(): Promise<Model[]> {
      const params = this.dbParams();
      const result = await state.client.send(new QueryCommand(params));
      state.logger?.log('QueryCommand', params, result);
      return (result.Items ?? []) as unknown as Model[];
    },

    async executeWithPagination(): Promise<QueryResult<Model>> {
      const params = this.dbParams();
      const result = await state.client.send(new QueryCommand(params));
      state.logger?.log('QueryCommand', params, result);
      return {
        items: (result.Items ?? []) as unknown as Model[],
        lastEvaluatedKey: result.LastEvaluatedKey,
        count: result.Count,
        scannedCount: result.ScannedCount,
      };
    },

    async *iterate(): AsyncIterableIterator<Model> {
      const baseParams = this.dbParams();
      let cursor: Record<string, any> | undefined = baseParams.ExclusiveStartKey;
      do {
        const params = { ...baseParams, ExclusiveStartKey: cursor };
        const result = await state.client.send(new QueryCommand(params));
        state.logger?.log('QueryCommand', params, result);
        for (const item of (result.Items ?? []) as unknown as Model[]) {
          yield item;
        }
        cursor = result.LastEvaluatedKey;
      } while (cursor);
    },
  };
}

/**
 * Creates a QueryBuilder for a table
 */
export function createQueryBuilder<Model>(
  tableName: string,
  client: DynamoDBClient,
  model?: ModelDefinition,
  logger?: DynamoDBLogger,
  entityType?: string
): QueryBuilder<Model> {
  return {
    where(fn) {
      // Create attribute builder proxy
      const attrProxy = new Proxy({} as AttrBuilder<Model>, {
        get(_, prop: string): AttrRef {
          return { name: prop };
        },
      });

      // Create a scoped opBuilder for this query to avoid global state
      const opBuilder = createOpBuilder();

      // Call the user's function to get the condition tree
      const condition = fn(attrProxy, opBuilder);

      return createQueryExecutor({
        tableName,
        client,
        condition,
        model,
        logger,
        entityType,
      });
    },
  };
}
