/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildExpression,
  AttrBuilder,
  Condition,
  createOpBuilder,
  buildProjectionExpression,
} from '../shared';
import { ScanBuilder, ScanResult } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Creates a ScanBuilder for scanning a table or index.
 */
export function createScanBuilder<Model>(
  tableName: string,
  client: DynamoDBClient,
  filters: Condition[] = [],
  projectionAttrs: (keyof Model)[] = [],
  limitValue?: number,
  isConsistentRead = false,
  indexName?: string,
  exclusiveStartKey?: Record<string, any>,
  segmentConfig?: { segment: number; totalSegments: number },
  logger?: DynamoDBLogger,
  consumedCapacity?: 'INDEXES' | 'TOTAL' | 'NONE'
): ScanBuilder<Model> {
  const build = (): ScanBuilder<Model> => ({
    filter(fn) {
      const attrs = new Proxy({} as AttrBuilder<Model>, {
        get(_, prop: string) {
          return { name: prop };
        },
      });
      const opBuilder = createOpBuilder();
      const condition = fn(attrs, opBuilder);
      return createScanBuilder(
        tableName,
        client,
        [...filters, condition],
        projectionAttrs,
        limitValue,
        isConsistentRead,
        indexName,
        exclusiveStartKey,
        segmentConfig,
        logger,
        consumedCapacity
      );
    },

    select(attrs) {
      return createScanBuilder(
        tableName,
        client,
        filters,
        attrs,
        limitValue,
        isConsistentRead,
        indexName,
        exclusiveStartKey,
        segmentConfig,
        logger,
        consumedCapacity
      );
    },

    limit(count) {
      return createScanBuilder(
        tableName,
        client,
        filters,
        projectionAttrs,
        count,
        isConsistentRead,
        indexName,
        exclusiveStartKey,
        segmentConfig,
        logger,
        consumedCapacity
      );
    },

    consistentRead() {
      return createScanBuilder(
        tableName,
        client,
        filters,
        projectionAttrs,
        limitValue,
        true,
        indexName,
        exclusiveStartKey,
        segmentConfig,
        logger,
        consumedCapacity
      );
    },

    usingIndex(index) {
      return createScanBuilder(
        tableName,
        client,
        filters,
        projectionAttrs,
        limitValue,
        isConsistentRead,
        index,
        exclusiveStartKey,
        segmentConfig,
        logger,
        consumedCapacity
      );
    },

    startFrom(key) {
      return createScanBuilder(
        tableName,
        client,
        filters,
        projectionAttrs,
        limitValue,
        isConsistentRead,
        indexName,
        key,
        segmentConfig,
        logger,
        consumedCapacity
      );
    },

    segment(segmentNumber, totalSegments) {
      return createScanBuilder(
        tableName,
        client,
        filters,
        projectionAttrs,
        limitValue,
        isConsistentRead,
        indexName,
        exclusiveStartKey,
        { segment: segmentNumber, totalSegments },
        logger,
        consumedCapacity
      );
    },

    returnConsumedCapacity(mode) {
      return createScanBuilder(
        tableName,
        client,
        filters,
        projectionAttrs,
        limitValue,
        isConsistentRead,
        indexName,
        exclusiveStartKey,
        segmentConfig,
        logger,
        mode
      );
    },

    dbParams() {
      const filterResult =
        filters.length > 0
          ? buildExpression(
              filters.length === 1 && filters[0]
                ? filters[0]
                : { expression: '', operator: 'AND' as const, children: filters }
            )
          : { expression: '', names: {} as Record<string, string>, values: {} as Record<string, any> };

      // Idempotent merge: filter and projection placeholders both map
      // `#name → name`, so collisions resolve to the same value.
      const projection =
        projectionAttrs.length > 0
          ? buildProjectionExpression(projectionAttrs.map((attr) => String(attr)))
          : undefined;

      const expressionAttributeNames = {
        ...(projection?.ExpressionAttributeNames ?? {}),
        ...filterResult.names,
      };

      return {
        TableName: tableName,
        ...(filterResult.expression && { FilterExpression: filterResult.expression }),
        ...(Object.keys(expressionAttributeNames).length > 0 && {
          ExpressionAttributeNames: expressionAttributeNames,
        }),
        ...(Object.keys(filterResult.values).length > 0 && {
          ExpressionAttributeValues: filterResult.values,
        }),
        ...(projection && { ProjectionExpression: projection.ProjectionExpression }),
        ...(limitValue !== undefined && { Limit: limitValue }),
        ...(isConsistentRead && { ConsistentRead: true }),
        ...(indexName && { IndexName: indexName }),
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
        ...(segmentConfig && {
          Segment: segmentConfig.segment,
          TotalSegments: segmentConfig.totalSegments,
        }),
        ...(consumedCapacity && { ReturnConsumedCapacity: consumedCapacity }),
      } as any;
    },

    /**
     * ⚠️ Returns only the FIRST page of results. DynamoDB caps each Scan
     * response at ~1MB (or `Limit` if set). If the matching set is larger,
     * the remaining items are silently dropped.
     *
     * Use {@link executeWithPagination} when you need to drive pagination
     * yourself, or {@link iterate} to walk every matching item lazily.
     */
    async execute() {
      const params = build().dbParams();
      const response = await client.send(new ScanCommand(params));
      logger?.log('ScanCommand', params, response);
      return (response.Items || []) as Model[];
    },

    async executeWithPagination(): Promise<ScanResult<Model>> {
      const params = build().dbParams();
      const response = await client.send(new ScanCommand(params));
      logger?.log('ScanCommand', params, response);
      return {
        items: (response.Items ?? []) as Model[],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count,
        scannedCount: response.ScannedCount,
      };
    },

    async *iterate(): AsyncIterableIterator<Model> {
      const baseParams = build().dbParams();
      let cursor: Record<string, any> | undefined = baseParams.ExclusiveStartKey;
      do {
        const params = { ...baseParams, ExclusiveStartKey: cursor };
        const response = await client.send(new ScanCommand(params));
        logger?.log('ScanCommand', params, response);
        for (const item of (response.Items ?? []) as Model[]) {
          yield item;
        }
        cursor = response.LastEvaluatedKey;
      } while (cursor);
    },
  });

  return build();
}
