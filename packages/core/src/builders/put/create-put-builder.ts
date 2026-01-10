/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { buildExpression, AttrBuilder, Condition, createOpBuilder } from '../shared';
import { PutBuilder } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Utility to infer if attribute exists in the item and returns condition.
 */
function buildNotExistsConditions(item: any): Condition[] {
  // Check for common key names (both uppercase and lowercase)
  const possibleKeys = ['PK', 'SK', 'pk', 'sk'];
  const foundKeys = possibleKeys.filter((key) => key in item);

  return foundKeys.map((key) => ({
    expression: `attribute_not_exists(#${key})`,
    names: { [`#${key}`]: key },
  }));
}

/**
 * Creates a PutBuilder for an item and table.
 */
export function createPutBuilder<Model>(
  tableName: string,
  item: Model,
  client: DynamoDBClient,
  prevConditions: Condition[] = [],
  shouldCheckNotExists = false,
  returnMode: 'NONE' | 'ALL_OLD' = 'NONE',
  enableTimestamps = false,
  logger?: DynamoDBLogger
): PutBuilder<Model> {
  const conditions = [...prevConditions];

  const build = (): PutBuilder<Model> => ({
    where(fn) {
      const attrs = new Proxy({} as AttrBuilder<Model>, {
        get(_, prop: string) {
          return { name: prop };
        },
      });
      // Create a scoped opBuilder for this operation to avoid global state
      const opBuilder = createOpBuilder();
      const condition = fn(attrs, opBuilder);
      return createPutBuilder(
        tableName,
        item,
        client,
        [...conditions, condition],
        shouldCheckNotExists,
        returnMode,
        enableTimestamps,
        logger
      );
    },

    ifNotExists() {
      return createPutBuilder(tableName, item, client, conditions, true, returnMode, enableTimestamps, logger);
    },

    returning(mode) {
      return createPutBuilder(
        tableName,
        item,
        client,
        conditions,
        shouldCheckNotExists,
        mode,
        enableTimestamps,
        logger
      );
    },

    dbParams() {
      let finalConditions = [...conditions];

      if (shouldCheckNotExists) {
        finalConditions = [...finalConditions, ...buildNotExistsConditions(item)];
      }

      // Add timestamps if enabled
      let finalItem = item;
      if (enableTimestamps) {
        const now = new Date().toISOString();
        finalItem = {
          ...item,
          createdAt: now,
          updatedAt: now,
        } as Model;
      }

      // Build ConditionExpression from condition tree
      let conditionExpression = '';
      let expressionAttributeNames = {};
      let expressionAttributeValues = {};

      if (finalConditions.length > 0) {
        // If there's only one condition, use it directly
        // Otherwise, combine with AND
        const combinedCondition =
          finalConditions.length === 1 && finalConditions[0]
            ? finalConditions[0]
            : {
                expression: '',
                operator: 'AND' as const,
                children: finalConditions,
              };

        const result = buildExpression(combinedCondition);
        conditionExpression = result.expression;
        expressionAttributeNames = result.names;
        expressionAttributeValues = result.values;
      }

      const extra: any = returnMode !== 'NONE' ? { ReturnValues: returnMode } : {};

      return {
        TableName: tableName,
        Item: finalItem,
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
      const response = await client.send(new PutCommand(params));
      logger?.log('PutCommand', params, response);

      // Return the old item if returnMode is ALL_OLD and it was replaced
      if (returnMode === 'ALL_OLD' && response.Attributes) {
        return response.Attributes as Model;
      }

      // For NONE mode or when no old item existed, return the new item with timestamps
      return params.Item as Model;
    },
  });

  return build();
}
