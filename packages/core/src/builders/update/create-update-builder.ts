/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { buildExpression, AttrBuilder, Condition, createOpBuilder, AttrRef } from '../shared';
import { UpdateBuilder, UpdateAction, IndexContext } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';
import { computeIndexUpdates } from '../../utils/model-utils';

/**
 * Pull the LHS attribute name out of a SET-action expression like
 * `#GSI1PK = :v_0` → `'GSI1PK'`. Returns `undefined` for shapes the
 * builder doesn't emit so callers can ignore them safely.
 */
function extractAttrName(action: UpdateAction): string | undefined {
  const m = action.expression.match(/^\s*#([A-Za-z0-9_]+)\s*=/);
  return m?.[1];
}

/**
 * Creates an UpdateBuilder for an item key and table.
 *
 * When `indexContext` is provided, fields written via `.set()` that participate
 * in any secondary-index template are detected and the affected index keys are
 * recomputed automatically and included in the SET expression. If a template
 * cannot be fully resolved from the primary-key vars plus the updates, building
 * the params throws — the caller must include the missing fields in `.set()`.
 */
export function createUpdateBuilder<Model>(
  tableName: string,
  key: Partial<Model>,
  client: DynamoDBClient,
  prevConditions: Condition[] = [],
  updateActions: {
    set: UpdateAction[];
    remove: UpdateAction[];
    add: UpdateAction[];
    delete: UpdateAction[];
  } = { set: [], remove: [], add: [], delete: [] },
  returnMode: 'NONE' | 'ALL_OLD' | 'ALL_NEW' | 'UPDATED_OLD' | 'UPDATED_NEW' = 'NONE',
  valueCounter = 0,
  enableTimestamps = false,
  logger?: DynamoDBLogger,
  indexContext?: IndexContext,
  setInputs: Record<string, any> = {}
): UpdateBuilder<Model> {
  const conditions = [...prevConditions];

  const getUniqueValueName = (baseName: string): string => {
    return `${baseName}_${valueCounter++}`;
  };

  const normalizeAttr = (attr: keyof Model | AttrRef): string => {
    if (typeof attr === 'string') {
      return attr;
    }
    return (attr as AttrRef).name;
  };

  const build = (): UpdateBuilder<Model> => ({
    where(fn) {
      const attrs = new Proxy({} as AttrBuilder<Model>, {
        get(_, prop: string) {
          return { name: prop };
        },
      });
      const opBuilder = createOpBuilder();
      const condition = fn(attrs, opBuilder);
      return createUpdateBuilder(
        tableName,
        key,
        client,
        [...conditions, condition],
        updateActions,
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs
      );
    },

    set(attrOrUpdates: keyof Model | AttrRef | Partial<Model>, value?: any) {
      // When no value is provided and the first arg is a plain object,
      // treat it as a Partial<Model>. The AttrRef overload always passes
      // a value, so it's handled by the single-update path below.
      if (
        value === undefined &&
        typeof attrOrUpdates === 'object' &&
        attrOrUpdates !== null
      ) {
        // Multiple updates case
        const updates = attrOrUpdates as Partial<Model>;
        const newActions: UpdateAction[] = [];
        const newSetInputs = { ...setInputs };

        for (const [attr, val] of Object.entries(updates)) {
          const attrName = attr;
          const valueName = getUniqueValueName(attrName);
          newActions.push({
            expression: `#${attrName} = :${valueName}`,
            names: { [`#${attrName}`]: attrName },
            values: { [`:${valueName}`]: val },
          });
          newSetInputs[attrName] = val;
        }

        return createUpdateBuilder(
          tableName,
          key,
          client,
          conditions,
          { ...updateActions, set: [...updateActions.set, ...newActions] },
          returnMode,
          valueCounter,
          enableTimestamps,
          logger,
          indexContext,
          newSetInputs
        );
      }

      // Single update case
      const attrName = normalizeAttr(attrOrUpdates as keyof Model | AttrRef);
      const valueName = getUniqueValueName(attrName);
      const action: UpdateAction = {
        expression: `#${attrName} = :${valueName}`,
        names: { [`#${attrName}`]: attrName },
        values: { [`:${valueName}`]: value },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, set: [...updateActions.set, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        { ...setInputs, [attrName]: value }
      );
    },

    remove(attr) {
      const attrName = normalizeAttr(attr);
      const action: UpdateAction = {
        expression: `#${attrName}`,
        names: { [`#${attrName}`]: attrName },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, remove: [...updateActions.remove, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs
      );
    },

    add(attr, value) {
      const attrName = normalizeAttr(attr);
      const valueName = getUniqueValueName(attrName);
      const action: UpdateAction = {
        expression: `#${attrName} :${valueName}`,
        names: { [`#${attrName}`]: attrName },
        values: { [`:${valueName}`]: value },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, add: [...updateActions.add, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs
      );
    },

    delete(attr, value) {
      const attrName = normalizeAttr(attr);
      const valueName = getUniqueValueName(attrName);
      const action: UpdateAction = {
        expression: `#${attrName} :${valueName}`,
        names: { [`#${attrName}`]: attrName },
        values: { [`:${valueName}`]: value },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, delete: [...updateActions.delete, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs
      );
    },

    returning(mode) {
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        updateActions,
        mode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs
      );
    },

    dbParams() {
      // Build UpdateExpression from actions
      const updateParts: string[] = [];
      const allNames: Record<string, string> = {};
      const allValues: Record<string, any> = {};

      // Clone updateActions to avoid mutation
      const actionsToProcess = { ...updateActions, set: [...updateActions.set] };

      // Auto-recompute secondary-index keys whose templates depend on any
      // updated field. If a template can't be fully resolved from the primary
      // key vars + the .set() payload, we throw — recomputing from the
      // existing item would require an extra read the builder won't do.
      if (indexContext) {
        const { actions: idxActions, missing } = computeIndexUpdates(
          indexContext.model,
          indexContext.keyVars,
          setInputs
        );
        if (missing.length > 0) {
          const details = missing
            .map(
              (m) =>
                `  - ${m.index} ("${m.template}"): missing ${m.missing.join(', ')}`
            )
            .join('\n');
          throw new Error(
            `Update touches fields that participate in secondary index templates, ` +
              `but the templates cannot be fully resolved from the update payload. ` +
              `Include the missing fields in .set():\n${details}`
          );
        }
        // If the user's `.set()` already targets the same index-key
        // attribute (e.g. `.set('GSI1PK', 'foo')`), refuse to silently
        // emit a second SET against the same path. DynamoDB rejects
        // `SET #GSI1PK = :a, #GSI1PK = :b` outright, and namespacing the
        // placeholders only hides which one wins. Force the caller to
        // resolve the conflict explicitly.
        const userSetKeys = new Set(actionsToProcess.set.map(extractAttrName));
        userSetKeys.delete(undefined);
        const conflicts = Object.keys(idxActions).filter((k) => userSetKeys.has(k));
        if (conflicts.length > 0) {
          throw new Error(
            `Update would write the same secondary-index key twice: ` +
              `[${conflicts.join(', ')}] is recomputed from the index template AND ` +
              `set explicitly via .set(). Either remove the explicit .set() and let ` +
              `the recomputation handle it, or include all template variables in ` +
              `.set() so you take full control.`
          );
        }
        for (const [indexName, resolved] of Object.entries(idxActions)) {
          const valueName = getUniqueValueName(indexName);
          actionsToProcess.set.push({
            expression: `#${indexName} = :${valueName}`,
            names: { [`#${indexName}`]: indexName },
            values: { [`:${valueName}`]: resolved },
          });
        }
      }

      // Add updatedAt timestamp if enabled
      if (enableTimestamps) {
        const now = new Date().toISOString();
        const timestampAction: UpdateAction = {
          expression: `#updatedAt = :updatedAt_ts`,
          names: { '#updatedAt': 'updatedAt' },
          values: { ':updatedAt_ts': now },
        };
        actionsToProcess.set = [...actionsToProcess.set, timestampAction];
      }

      if (actionsToProcess.set.length > 0) {
        const setExpressions = actionsToProcess.set.map((action) => {
          Object.assign(allNames, action.names || {});
          Object.assign(allValues, action.values || {});
          return action.expression;
        });
        updateParts.push(`SET ${setExpressions.join(', ')}`);
      }

      if (updateActions.remove.length > 0) {
        const removeExpressions = updateActions.remove.map((action) => {
          Object.assign(allNames, action.names || {});
          return action.expression;
        });
        updateParts.push(`REMOVE ${removeExpressions.join(', ')}`);
      }

      if (updateActions.add.length > 0) {
        const addExpressions = updateActions.add.map((action) => {
          Object.assign(allNames, action.names || {});
          Object.assign(allValues, action.values || {});
          return action.expression;
        });
        updateParts.push(`ADD ${addExpressions.join(', ')}`);
      }

      if (updateActions.delete.length > 0) {
        const deleteExpressions = updateActions.delete.map((action) => {
          Object.assign(allNames, action.names || {});
          Object.assign(allValues, action.values || {});
          return action.expression;
        });
        updateParts.push(`DELETE ${deleteExpressions.join(', ')}`);
      }

      const updateExpression = updateParts.join(' ');

      // Build ConditionExpression from conditions
      let conditionExpression = '';
      let conditionNames = {};
      let conditionValues = {};

      if (conditions.length > 0) {
        const combinedCondition =
          conditions.length === 1 && conditions[0]
            ? conditions[0]
            : {
                expression: '',
                operator: 'AND' as const,
                children: conditions,
              };

        const result = buildExpression(combinedCondition);
        conditionExpression = result.expression;
        conditionNames = result.names;
        conditionValues = result.values;
      }

      // Merge names and values
      const expressionAttributeNames = {
        ...allNames,
        ...conditionNames,
      };
      const expressionAttributeValues = {
        ...allValues,
        ...conditionValues,
      };

      const extra: any = returnMode !== 'NONE' ? { ReturnValues: returnMode } : {};

      return {
        TableName: tableName,
        Key: key,
        ...(updateExpression && { UpdateExpression: updateExpression }),
        ...(conditionExpression && {
          ConditionExpression: conditionExpression,
        }),
        ...(Object.keys(expressionAttributeNames).length && {
          ExpressionAttributeNames: expressionAttributeNames,
        }),
        ...(Object.keys(expressionAttributeValues).length && {
          ExpressionAttributeValues: expressionAttributeValues,
        }),
        ...extra,
      };
    },

    async execute() {
      const params = build().dbParams();
      const response = await client.send(new UpdateCommand(params));
      logger?.log('UpdateCommand', params, response);

      // Return the item based on returnMode
      if (response.Attributes) {
        return response.Attributes as Model;
      }

      // If no attributes returned (NONE mode), return undefined
      return undefined as unknown as Model;
    },
  });

  return build();
}
