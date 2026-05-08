/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  BatchWriteCommandInput,
  BatchWriteCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  BATCH_WRITE_LIMIT,
  BatchUnprocessedError,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BACKOFF_MS,
  backoffMs,
  chunkRequestItems,
  isUnprocessedEmpty,
  sleep,
} from '../shared';
import { BatchWriteBuilder, WriteRequest } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Creates a BatchWriteBuilder to put or delete multiple items.
 *
 * `execute()` transparently chunks `requestItems` into sub-requests of at
 * most 25 items (DynamoDB's `BatchWriteItem` limit) and retries any
 * UnprocessedItems with exponential backoff. The `dbParams()` method
 * still returns the un-chunked request — see its JSDoc for details.
 *
 * @param requestItems - An object where keys are table names and values are arrays of WriteRequest
 * @param client - DynamoDB client instance
 * @param logger - Optional logger instance
 */
export function createBatchWriteBuilder(
  requestItems: Record<string, WriteRequest[]>,
  client: DynamoDBClient,
  logger?: DynamoDBLogger,
  options?: {
    maxRetries?: number;
    retryBackoffMs?: number;
  }
): BatchWriteBuilder {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBackoff = options?.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;

  return {
    maxRetries(n: number) {
      return createBatchWriteBuilder(requestItems, client, logger, {
        maxRetries: n,
        retryBackoffMs: retryBackoff,
      });
    },

    retryBackoffMs(ms: number) {
      return createBatchWriteBuilder(requestItems, client, logger, {
        maxRetries,
        retryBackoffMs: ms,
      });
    },

    dbParams(): BatchWriteCommandInput {
      return {
        RequestItems: requestItems,
      };
    },

    async execute(): Promise<{
      unprocessedItems?: Record<string, WriteRequest[]>;
    }> {
      const chunks = chunkRequestItems(requestItems, BATCH_WRITE_LIMIT);
      if (chunks.length === 0) {
        return {};
      }

      for (const chunk of chunks) {
        let pending: Record<string, WriteRequest[]> = chunk;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const params: BatchWriteCommandInput = { RequestItems: pending };
          const result: BatchWriteCommandOutput = await client.send(
            new BatchWriteCommand(params)
          );
          logger?.log('BatchWriteCommand', params, result);

          const unprocessed = result.UnprocessedItems as
            | Record<string, WriteRequest[]>
            | undefined;

          if (isUnprocessedEmpty(unprocessed)) {
            break; // chunk fully processed
          }

          if (attempt === maxRetries) {
            throw new BatchUnprocessedError(
              `BatchWrite still has unprocessed items after ${maxRetries} retries.`,
              unprocessed!
            );
          }

          await sleep(backoffMs(attempt, retryBackoff));
          pending = unprocessed!;
        }
      }

      return {};
    },
  };
}
