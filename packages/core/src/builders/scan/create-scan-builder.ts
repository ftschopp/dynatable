/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { buildExpression, AttrBuilder, Condition, createOpBuilder } from '../shared';
import { ScanBuilder } from './types';
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
  logger?: DynamoDBLogger
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
        logger
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
        logger
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
        logger
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
        logger
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
        logger
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
        logger
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
        logger
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

      // Build ProjectionExpression
      let projectionExpression = '';
      if (projectionAttrs.length > 0) {
        projectionExpression = projectionAttrs.map((attr) => String(attr)).join(', ');
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

      return params;
    },

    async execute() {
      const params = build().dbParams();
      const response = await client.send(new ScanCommand(params));
      logger?.log('ScanCommand', params, response);
      return (response.Items || []) as Model[];
    },
  });

  return build();
}
