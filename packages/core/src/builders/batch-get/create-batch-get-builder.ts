/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchGetCommandInput,
  BatchGetCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  BATCH_GET_LIMIT,
  BatchUnprocessedError,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BACKOFF_MS,
  backoffMs,
  buildProjectionExpression,
  chunkRequestItems,
  isUnprocessedEmpty,
  sleep,
} from '../shared';
import { BatchGetBuilder } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

type TableRequest = {
  Keys: any[];
  ProjectionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ConsistentRead?: boolean;
};

/**
 * Builds the per-table request shape with projection placeholders applied.
 *
 * Resolves the same `#-placeholder` projection (from #5) for every table in
 * the request — the projection is a property of the builder, not per-table.
 */
function buildEnhancedRequestItems(
  requestItems: Record<string, { Keys: any[] }>,
  projection: string[],
  isConsistent: boolean
): Record<string, TableRequest> {
  const proj = projection.length > 0 ? buildProjectionExpression(projection) : undefined;

  return Object.entries(requestItems).reduce(
    (acc, [tableName, tableRequest]) => {
      acc[tableName] = {
        Keys: tableRequest.Keys,
        ...(proj && {
          ProjectionExpression: proj.ProjectionExpression,
          ExpressionAttributeNames: proj.ExpressionAttributeNames,
        }),
        ...(isConsistent && { ConsistentRead: true }),
      };
      return acc;
    },
    {} as Record<string, TableRequest>
  );
}

/**
 * Creates a BatchGetBuilder to retrieve multiple items by their keys.
 *
 * `execute()` transparently chunks the request to at most 100 keys per
 * SDK call (DynamoDB's `BatchGetItem` limit) and retries any
 * UnprocessedKeys with exponential backoff. The `dbParams()` method
 * still returns the un-chunked request — see its JSDoc.
 *
 * @param requestItems - An object where keys are table names and values are objects containing Keys array
 * @param client - DynamoDB client instance
 * @param options - Optional configuration (projection, consistentRead, maxRetries, retryBackoffMs)
 * @param logger - Optional logger instance
 */
export function createBatchGetBuilder<Model>(
  requestItems: Record<string, { Keys: any[] }>,
  client: DynamoDBClient,
  options?: {
    projection?: (keyof Model)[];
    consistentRead?: boolean;
    maxRetries?: number;
    retryBackoffMs?: number;
  },
  logger?: DynamoDBLogger
): BatchGetBuilder<Model> {
  const projection = options?.projection ?? [];
  const isConsistent = options?.consistentRead ?? false;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBackoff = options?.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;

  return {
    select(attrs) {
      return createBatchGetBuilder(
        requestItems,
        client,
        {
          projection: attrs,
          consistentRead: isConsistent,
          maxRetries,
          retryBackoffMs: retryBackoff,
        },
        logger
      );
    },

    consistentRead() {
      return createBatchGetBuilder(
        requestItems,
        client,
        {
          projection,
          consistentRead: true,
          maxRetries,
          retryBackoffMs: retryBackoff,
        },
        logger
      );
    },

    maxRetries(n: number) {
      return createBatchGetBuilder(
        requestItems,
        client,
        {
          projection,
          consistentRead: isConsistent,
          maxRetries: n,
          retryBackoffMs: retryBackoff,
        },
        logger
      );
    },

    retryBackoffMs(ms: number) {
      return createBatchGetBuilder(
        requestItems,
        client,
        {
          projection,
          consistentRead: isConsistent,
          maxRetries,
          retryBackoffMs: ms,
        },
        logger
      );
    },

    dbParams(): BatchGetCommandInput {
      return {
        RequestItems: buildEnhancedRequestItems(
          requestItems,
          projection.map(String),
          isConsistent
        ),
      };
    },

    async execute(): Promise<Model[]> {
      // Chunk only the Keys (the projection / consistentRead options are
      // re-applied per chunk).
      const flatKeys: Record<string, any[]> = {};
      for (const [tableName, tr] of Object.entries(requestItems)) {
        flatKeys[tableName] = tr.Keys;
      }
      const chunks = chunkRequestItems(flatKeys, BATCH_GET_LIMIT);
      if (chunks.length === 0) return [];

      const aggregated: Model[] = [];

      for (const chunk of chunks) {
        const chunkRequest: Record<string, { Keys: any[] }> = {};
        for (const [tableName, keys] of Object.entries(chunk)) {
          chunkRequest[tableName] = { Keys: keys };
        }

        let pending: Record<string, TableRequest> = buildEnhancedRequestItems(
          chunkRequest,
          projection.map(String),
          isConsistent
        );

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const params: BatchGetCommandInput = { RequestItems: pending };
          const result: BatchGetCommandOutput = await client.send(
            new BatchGetCommand(params)
          );
          logger?.log('BatchGetCommand', params, result);

          if (result.Responses) {
            for (const items of Object.values(result.Responses)) {
              aggregated.push(...(items as unknown as Model[]));
            }
          }

          const unprocessed = result.UnprocessedKeys as
            | Record<string, TableRequest>
            | undefined;

          if (isUnprocessedEmpty(unprocessed)) {
            break;
          }

          if (attempt === maxRetries) {
            throw new BatchUnprocessedError(
              `BatchGet still has unprocessed keys after ${maxRetries} retries.`,
              unprocessed!
            );
          }

          await sleep(backoffMs(attempt, retryBackoff));
          pending = unprocessed!;
        }
      }

      return aggregated;
    },
  };
}
