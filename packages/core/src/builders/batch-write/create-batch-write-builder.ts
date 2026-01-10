/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  BatchWriteCommandInput,
  BatchWriteCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { BatchWriteBuilder, WriteRequest } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Creates a BatchWriteBuilder to put or delete multiple items.
 *
 * @param requestItems - An object where keys are table names and values are arrays of WriteRequest
 * @param client - DynamoDB client instance
 * @param logger - Optional logger instance
 */
export function createBatchWriteBuilder(
  requestItems: Record<string, WriteRequest[]>,
  client: DynamoDBClient,
  logger?: DynamoDBLogger
): BatchWriteBuilder {
  return {
    /**
     * Build the underlying DynamoDB input parameters.
     */
    dbParams(): BatchWriteCommandInput {
      return {
        RequestItems: requestItems,
      };
    },

    /**
     * Execute the BatchWriteItem command.
     */
    async execute(): Promise<{
      unprocessedItems?: Record<string, WriteRequest[]>;
    }> {
      const params = this.dbParams();
      const result: BatchWriteCommandOutput = await client.send(new BatchWriteCommand(params));
      logger?.log('BatchWriteCommand', params, result);

      // Return unprocessed items if any
      return {
        unprocessedItems: result.UnprocessedItems as Record<string, WriteRequest[]> | undefined,
      };
    },
  };
}
