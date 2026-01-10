/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchGetCommandInput,
  BatchGetCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { BatchGetBuilder } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Creates a BatchGetBuilder to retrieve multiple items by their keys.
 *
 * @param requestItems - An object where keys are table names and values are objects containing Keys array
 * @param client - DynamoDB client instance
 * @param options - Optional configuration (projection, consistentRead)
 * @param logger - Optional logger instance
 */
export function createBatchGetBuilder<Model>(
  requestItems: Record<string, { Keys: any[] }>,
  client: DynamoDBClient,
  options?: {
    projection?: (keyof Model)[];
    consistentRead?: boolean;
  },
  logger?: DynamoDBLogger
): BatchGetBuilder<Model> {
  const projection = options?.projection ?? [];
  const isConsistent = options?.consistentRead ?? false;

  return {
    /**
     * Select only specific attributes to retrieve.
     */
    select(attrs) {
      return createBatchGetBuilder(
        requestItems,
        client,
        {
          projection: attrs,
          consistentRead: isConsistent,
        },
        logger
      );
    },

    /**
     * Enable strongly consistent read.
     */
    consistentRead() {
      return createBatchGetBuilder(
        requestItems,
        client,
        {
          projection,
          consistentRead: true,
        },
        logger
      );
    },

    /**
     * Build the underlying DynamoDB input parameters.
     */
    dbParams(): BatchGetCommandInput {
      // Apply projection and consistentRead to all tables
      const enhancedRequestItems = Object.entries(requestItems).reduce(
        (acc, [tableName, tableRequest]) => {
          acc[tableName] = {
            Keys: tableRequest.Keys,
            ...(projection.length > 0 && {
              ProjectionExpression: projection.join(', '),
            }),
            ...(isConsistent && { ConsistentRead: true }),
          };
          return acc;
        },
        {} as Record<string, any>
      );

      return {
        RequestItems: enhancedRequestItems,
      };
    },

    /**
     * Execute the BatchGetItem command and return the items.
     */
    async execute(): Promise<Record<string, Model[]>> {
      const params = this.dbParams();
      const result: BatchGetCommandOutput = await client.send(new BatchGetCommand(params));
      logger?.log('BatchGetCommand', params, result);

      // Transform the response into a more usable format
      const responses: Record<string, Model[]> = {};

      if (result.Responses) {
        for (const [tableName, items] of Object.entries(result.Responses)) {
          responses[tableName] = items as unknown as Model[];
        }
      }

      return responses;
    },
  };
}
