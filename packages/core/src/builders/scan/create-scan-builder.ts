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
      let filterExpression = '';
      let expressionAttributeNames: Record<string, string> = {};
      let expressionAttributeValues: Record<string, any> = {};

      // Build FilterExpression from filters
      if (filters.length > 0) {
        const combinedFilter =
          filters.length === 1 && filters[0]
            ? filters[0]
            : {
                expression: '',
                operator: 'AND' as const,
                children: filters,
              };

        const result = buildExpression(combinedFilter);
        filterExpression = result.expression;
        expressionAttributeNames = result.names;
        expressionAttributeValues = result.values;
      }

      // Build ProjectionExpression with placeholders so reserved words
      // (name, date, status, type, …) don't blow up at DynamoDB.
      let projectionExpression = '';
      if (projectionAttrs.length > 0) {
        const proj = buildProjectionExpression(projectionAttrs.map((attr) => String(attr)));
        projectionExpression = proj.ProjectionExpression;
        // Idempotent merge: filter and projection placeholders both map
        // `#name → name`, so collisions resolve to the same value.
        expressionAttributeNames = {
          ...proj.ExpressionAttributeNames,
          ...expressionAttributeNames,
        };
      }

      const params: any = {
        TableName: tableName,
      };

      if (filterExpression) {
        params.FilterExpression = filterExpression;
      }

      if (Object.keys(expressionAttributeNames).length > 0) {
        params.ExpressionAttributeNames = expressionAttributeNames;
      }

      if (Object.keys(expressionAttributeValues).length > 0) {
        params.ExpressionAttributeValues = expressionAttributeValues;
      }

      if (projectionExpression) {
        params.ProjectionExpression = projectionExpression;
      }

      if (limitValue !== undefined) {
        params.Limit = limitValue;
      }

      if (isConsistentRead) {
        params.ConsistentRead = true;
      }

      if (indexName) {
        params.IndexName = indexName;
      }

      if (exclusiveStartKey) {
        params.ExclusiveStartKey = exclusiveStartKey;
      }

      if (segmentConfig) {
        params.Segment = segmentConfig.segment;
        params.TotalSegments = segmentConfig.totalSegments;
      }

      if (consumedCapacity) {
        params.ReturnConsumedCapacity = consumedCapacity;
      }

      return params;
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
