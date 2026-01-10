/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { buildExpression, AttrBuilder, Condition, createOpBuilder } from '../shared';
import { DeleteBuilder } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Creates a DeleteBuilder for an item key and table.
 */
export function createDeleteBuilder<Model>(
  tableName: string,
  key: Partial<Model>,
  client: DynamoDBClient,
  prevConditions: Condition[] = [],
  returnMode: 'NONE' | 'ALL_OLD' = 'NONE',
  logger?: DynamoDBLogger
): DeleteBuilder<Model> {
  const conditions = [...prevConditions];

  const build = (): DeleteBuilder<Model> => ({
    where(fn) {
      const attrs = new Proxy({} as AttrBuilder<Model>, {
        get(_, prop: string) {
          return { name: prop };
        },
      });
      const opBuilder = createOpBuilder();
      const condition = fn(attrs, opBuilder);
      return createDeleteBuilder(
        tableName,
        key,
        client,
        [...conditions, condition],
        returnMode,
        logger
      );
    },

    returning(mode) {
      return createDeleteBuilder(tableName, key, client, conditions, mode, logger);
    },

    dbParams() {
      // Build ConditionExpression from condition tree
      let conditionExpression = '';
      let expressionAttributeNames = {};
      let expressionAttributeValues = {};

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
        expressionAttributeNames = result.names;
        expressionAttributeValues = result.values;
      }

      const extra: any = returnMode !== 'NONE' ? { ReturnValues: returnMode } : {};

      return {
        TableName: tableName,
        Key: key,
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
      const response = await client.send(new DeleteCommand(params));
      logger?.log('DeleteCommand', params, response);

      // Return the deleted item if returnMode is ALL_OLD
      if (returnMode === 'ALL_OLD' && response.Attributes) {
        return response.Attributes as Model;
      }

      // For NONE mode, return the key as a fallback
      return key as Model;
    },
  });

  return build();
}
