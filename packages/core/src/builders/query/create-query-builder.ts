/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { Condition, AttrBuilder, AttrRef } from '../shared';
import { createOpBuilder } from '../shared/operators';
import { buildExpression } from '../shared/conditions';
import { QueryBuilder, QueryExecutor, QueryResult } from './types';
import { ModelDefinition } from '../../core/types';
import { extractTemplateVars } from '../../utils/model-utils';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

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
};

/**
 * Determines if a field is a key field (used in pk/sk templates)
 */
function isKeyField(fieldName: string, model?: ModelDefinition): boolean {
  if (!model?.key) return false;

  const keyEntries = Object.entries(model.key);
  for (const [, keyDef] of keyEntries) {
    const templateVars = extractTemplateVars(keyDef.value);
    if (templateVars.includes(fieldName)) {
      return true;
    }
  }
  return false;
}

/**
 * Maps a model attribute name to its corresponding DynamoDB key name (PK/SK)
 * Also returns the key template for value transformation
 */
function getKeyNameForAttribute(
  fieldName: string,
  model?: ModelDefinition
): { keyName: string; template: string } | null {
  if (!model?.key) return null;

  for (const [keyName, keyDef] of Object.entries(model.key)) {
    const templateVars = extractTemplateVars(keyDef.value);
    if (templateVars.includes(fieldName)) {
      return { keyName, template: keyDef.value }; // Returns "PK" and "UP#${username}"
    }
  }
  return null;
}

/**
 * Apply key template to transform attribute value to key value
 * e.g., applyKeyTemplate("UP#${username}", "username", "johndoe") -> "UP#johndoe"
 */
function applyKeyTemplate(template: string, fieldName: string, fieldValue: any): string {
  return template.replace(`\${${fieldName}}`, fieldValue);
}

/**
 * Separates a condition tree into key conditions and filter conditions
 * Key conditions are rewritten to use actual DynamoDB key names (PK/SK)
 */
function separateConditions(
  condition: Condition,
  model?: ModelDefinition
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

    // It's a leaf condition - check if it's a key field
    // Extract field name from the expression (e.g., "#username" -> "username")
    const fieldMatch = cond.expression.match(/#(\w+)/);
    if (fieldMatch && fieldMatch[1]) {
      const fieldName = fieldMatch[1];
      const keyInfo = getKeyNameForAttribute(fieldName, model);

      if (keyInfo) {
        // This is a key field - rewrite the condition to use the actual key name
        // and apply the template to the value

        // Find the value placeholder in the condition and transform it
        const newValues: Record<string, any> = {};
        if (cond.values) {
          for (const [valuePlaceholder, value] of Object.entries(cond.values)) {
            // Apply the key template to transform the value
            const transformedValue = applyKeyTemplate(keyInfo.template, fieldName, value);
            newValues[valuePlaceholder] = transformedValue;
          }
        }

        const rewrittenCond = {
          ...cond,
          expression: cond.expression.replace(
            new RegExp(`#${fieldName}\\b`, 'g'),
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
function createQueryExecutor<Model, M extends ModelDefinition = any>(
  state: QueryState<Model>
): QueryExecutor<Model, M> {
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

    dbParams(): QueryCommandInput {
      if (!state.condition) {
        throw new Error('No where condition specified');
      }

      // Separate key conditions from filter conditions
      const { keyConditions, filterConditions } = separateConditions(state.condition, state.model);

      // Build KeyConditionExpression (simple AND)
      const keyExpr = buildSimpleAndExpression(keyConditions);

      // Build FilterExpression (can be complex with OR, NOT, etc.)
      let filterExpr = { expression: '', names: {}, values: {} };
      if (filterConditions.length > 0) {
        if (filterConditions.length === 1 && filterConditions[0]) {
          filterExpr = buildExpression(filterConditions[0]);
        } else {
          // Multiple filter conditions - combine with AND
          filterExpr = buildExpression({
            expression: '',
            operator: 'AND',
            children: filterConditions,
          });
        }
      }

      // Merge attribute names and values from both expressions
      const allNames = {
        ...(keyExpr.names ?? {}),
        ...(filterExpr.names ?? {}),
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
        ...(state.projection &&
          state.projection.length > 0 && {
            ProjectionExpression: state.projection.join(', '),
          }),
        ...(state.consistentReadEnabled && { ConsistentRead: true }),
        ...(state.exclusiveStartKey && {
          ExclusiveStartKey: state.exclusiveStartKey,
        }),
      };
    },

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
  };
}

/**
 * Creates a QueryBuilder for a table
 */
export function createQueryBuilder<Model, M extends ModelDefinition = any>(
  tableName: string,
  client: DynamoDBClient,
  model?: M,
  logger?: DynamoDBLogger
): QueryBuilder<Model, M> {
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

      // Create initial state with the condition
      const initialState: QueryState<Model> = {
        tableName,
        client,
        model,
        condition,
        logger,
      };

      return createQueryExecutor(initialState);
    },
  };
}
