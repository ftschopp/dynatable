/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { createQueryBuilder } from './create-query-builder';
import { ModelDefinition } from '../../core/types';

const ddbMock = mockClient(DynamoDBClient);

describe('QueryBuilder - Pagination', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface TestModel {
    pk: string;
    sk: string;
    name?: string;
    age?: number;
    status?: string;
  }

  const testModel: ModelDefinition = {
    key: {
      PK: { type: String, value: 'USER#${username}' },
      SK: { type: String, value: 'USER#${username}' },
    },
    attributes: {
      username: { type: String, required: true },
      name: { type: String },
      age: { type: Number },
      status: { type: String },
    },
  };

  beforeEach(() => {
    ddbMock.reset();
  });

  describe('startFrom method', () => {
    test('should add ExclusiveStartKey to query params', () => {
      const startKey = { pk: 'USER#alice', sk: 'USER#alice' };
      const params = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.pk, 'USER#alice'))
        .startFrom(startKey)
        .dbParams();

      expect(params.ExclusiveStartKey).toEqual(startKey);
    });

    test('should work with all other query options', () => {
      const startKey = { pk: 'USER#alice', sk: 'USER#alice' };
      const params = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.pk, 'USER#alice'))
        .startFrom(startKey)
        .limit(10)
        .scanIndexForward(false)
        .select(['name', 'age'])
        .dbParams();

      expect(params.ExclusiveStartKey).toEqual(startKey);
      expect(params.Limit).toBe(10);
      expect(params.ScanIndexForward).toBe(false);
      expect(params.ProjectionExpression).toBe('name, age');
    });

    test('should not include ExclusiveStartKey if not set', () => {
      const params = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.pk, 'USER#alice'))
        .dbParams();

      expect(params.ExclusiveStartKey).toBeUndefined();
    });
  });

  describe('executeWithPagination method', () => {
    test('should return items and lastEvaluatedKey', async () => {
      const mockItems = [
        { pk: 'USER#alice', sk: 'USER#alice', name: 'Alice' },
        { pk: 'USER#bob', sk: 'USER#bob', name: 'Bob' },
      ];
      const mockLastKey = { pk: 'USER#bob', sk: 'USER#bob' };

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        LastEvaluatedKey: mockLastKey,
        Count: 2,
        ScannedCount: 2,
      });

      const result = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.pk, 'USER#alice'))
        .limit(2)
        .executeWithPagination();

      expect(result.items).toEqual(mockItems);
      expect(result.lastEvaluatedKey).toEqual(mockLastKey);
      expect(result.count).toBe(2);
      expect(result.scannedCount).toBe(2);
    });

    test('should return undefined lastEvaluatedKey when no more results', async () => {
      const mockItems = [{ pk: 'USER#alice', sk: 'USER#alice', name: 'Alice' }];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
      });

      const result = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.pk, 'USER#alice'))
        .executeWithPagination();

      expect(result.items).toEqual(mockItems);
      expect(result.lastEvaluatedKey).toBeUndefined();
    });

    test('should handle empty results', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        ScannedCount: 0,
      });

      const result = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.pk, 'USER#nonexistent'))
        .executeWithPagination();

      expect(result.items).toEqual([]);
      expect(result.lastEvaluatedKey).toBeUndefined();
      expect(result.count).toBe(0);
      expect(result.scannedCount).toBe(0);
    });
  });

  describe('Pagination workflow', () => {
    test('should support manual pagination loop', async () => {
      // First page
      const page1Items = [
        { pk: 'USER#1', sk: 'USER#1', name: 'User 1' },
        { pk: 'USER#2', sk: 'USER#2', name: 'User 2' },
      ];
      const page1LastKey = { pk: 'USER#2', sk: 'USER#2' };

      // Second page
      const page2Items = [
        { pk: 'USER#3', sk: 'USER#3', name: 'User 3' },
        { pk: 'USER#4', sk: 'USER#4', name: 'User 4' },
      ];
      const page2LastKey = { pk: 'USER#4', sk: 'USER#4' };

      // Third page (last)
      const page3Items = [{ pk: 'USER#5', sk: 'USER#5', name: 'User 5' }];

      ddbMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: page1Items,
          LastEvaluatedKey: page1LastKey,
          Count: 2,
          ScannedCount: 2,
        })
        .resolvesOnce({
          Items: page2Items,
          LastEvaluatedKey: page2LastKey,
          Count: 2,
          ScannedCount: 2,
        })
        .resolvesOnce({
          Items: page3Items,
          Count: 1,
          ScannedCount: 1,
        });

      const allItems: any[] = [];
      let lastKey: any = undefined;

      // Page 1
      const result1 = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.pk, 'USER#'))
        .limit(2)
        .executeWithPagination();

      allItems.push(...result1.items);
      lastKey = result1.lastEvaluatedKey;
      expect(lastKey).toBeDefined();

      // Page 2
      const result2 = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.pk, 'USER#'))
        .limit(2)
        .startFrom(lastKey)
        .executeWithPagination();

      allItems.push(...result2.items);
      lastKey = result2.lastEvaluatedKey;
      expect(lastKey).toBeDefined();

      // Page 3
      const result3 = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.pk, 'USER#'))
        .limit(2)
        .startFrom(lastKey)
        .executeWithPagination();

      allItems.push(...result3.items);
      lastKey = result3.lastEvaluatedKey;
      expect(lastKey).toBeUndefined();

      // Verify all items collected
      expect(allItems).toHaveLength(5);
      expect(allItems[0].name).toBe('User 1');
      expect(allItems[4].name).toBe('User 5');
    });
  });

  describe('Immutability', () => {
    test('should create new builder instance when using startFrom', () => {
      const builder1 = createQueryBuilder<TestModel>(tableName, client, testModel).where(
        (attr, op) => op.eq(attr.pk, 'USER#alice')
      );

      const startKey = { pk: 'USER#alice', sk: 'USER#alice' };
      const builder2 = builder1.startFrom(startKey);

      expect(builder1.dbParams().ExclusiveStartKey).toBeUndefined();
      expect(builder2.dbParams().ExclusiveStartKey).toEqual(startKey);
    });
  });
});
