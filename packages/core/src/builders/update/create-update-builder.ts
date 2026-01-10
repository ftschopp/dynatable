/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { buildExpression, AttrBuilder, Condition, createOpBuilder, AttrRef } from '../shared';
import { UpdateBuilder, UpdateAction } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Creates an UpdateBuilder for an item key and table.
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
  logger?: DynamoDBLogger
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
        logger
      );
    },

    set(attr, value) {
      const attrName = normalizeAttr(attr);
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
        logger
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
        logger
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
        logger
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
        logger
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
        logger
      );
    },

    dbParams() {
      // Build UpdateExpression from actions
      const updateParts: string[] = [];
      const allNames: Record<string, string> = {};
      const allValues: Record<string, any> = {};

      // Clone updateActions to avoid mutation
      const actionsToProcess = { ...updateActions };

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

      // Return the updated item based on returnMode
      if (returnMode === 'ALL_NEW' && response.Attributes) {
        return response.Attributes as Model;
      }
      if (returnMode === 'UPDATED_NEW' && response.Attributes) {
        return response.Attributes as Model;
      }

      // For other modes, return the key as a fallback
      return key as Model;
    },
  });

  return build();
}
