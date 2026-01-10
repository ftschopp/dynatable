/* eslint-disable @typescript-eslint/no-explicit-any */
import { Table } from '../../src/table';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBClient);

/**
 * Integration tests for Pagination and Timestamps features
 */
describe('Pagination and Timestamps Integration Tests', () => {
  const TestSchema = {
    format: 'dynatable:1.0.0',
    version: '0.0.1',
    indexes: {
      primary: { hash: 'pk', sort: 'sk' },
    },
    models: {
      User: {
        key: {
          PK: { type: String, value: 'USER#${username}' },
          SK: { type: String, value: 'USER#${username}' },
        },
        attributes: {
          username: { type: String, required: true },
          name: { type: String, required: true },
          email: { type: String },
        },
      },
      Post: {
        key: {
          PK: { type: String, value: 'USER#${username}' },
          SK: { type: String, value: 'POST#${postId}' },
        },
        attributes: {
          username: { type: String, required: true },
          postId: { type: String, generate: 'ulid' },
          title: { type: String, required: true },
          content: { type: String },
        },
      },
    },
    params: {
      isoDates: true,
      timestamps: true, // Enable automatic timestamps
    },
  } as const;

  const client = new DynamoDBClient({});
  const table = new Table({
    name: 'TestTable',
    client,
    schema: TestSchema,
  });

  beforeEach(() => {
    ddbMock.reset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Timestamps Feature', () => {
    test('put should add createdAt and updatedAt timestamps', () => {
      const params = table.entities.User.put({
        username: 'alice',
        name: 'Alice Smith',
        email: 'alice@example.com',
      }).dbParams();

      expect(params.Item.createdAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(params.Item.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });

    test('update should add updatedAt timestamp automatically', () => {
      jest.setSystemTime(new Date('2024-01-15T11:30:00.000Z'));

      const params = table.entities.User.update({
        username: 'alice',
      })
        .set('name', 'Alice Johnson')
        .dbParams();

      expect(params.UpdateExpression).toContain('updatedAt');
      expect(params.ExpressionAttributeValues).toMatchObject({
        ':updatedAt_ts': '2024-01-15T11:30:00.000Z',
      });
    });

    test('update should not add createdAt', () => {
      const params = table.entities.User.update({
        username: 'alice',
      })
        .set('name', 'Alice Johnson')
        .dbParams();

      expect(params.UpdateExpression).not.toContain('createdAt');
      expect(params.ExpressionAttributeNames).not.toHaveProperty('#createdAt');
    });

    test('batchWrite should add timestamps to all items', () => {
      const params = table.entities.User.batchWrite([
        { username: 'alice', name: 'Alice Smith' },
        { username: 'bob', name: 'Bob Jones' },
        { username: 'charlie', name: 'Charlie Brown' },
      ]).dbParams();

      const items = params.RequestItems?.TestTable.map((req: any) => req.PutRequest.Item);

      items?.forEach((item: any) => {
        expect(item.createdAt).toEqual('2024-01-15T10:00:00.000Z');
        expect(item.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
      });
    });

    test('timestamps should work with generated IDs', () => {
      const params = table.entities.Post.put({
        username: 'alice',
        title: 'My First Post',
        content: 'Hello World!',
      }).dbParams();

      expect(params.Item.postId).toBeDefined();
      expect(params.Item.createdAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(params.Item.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });

    test('update with multiple SET operations should include updatedAt', () => {
      const params = table.entities.User.update({
        username: 'alice',
      })
        .set('name', 'Alice Johnson')
        .set('email', 'alice.j@example.com')
        .dbParams();

      const updateExpr = params.UpdateExpression;

      // Should include updatedAt in the SET expression
      expect(updateExpr).toContain('updatedAt');
      expect(updateExpr).toContain('SET');

      // Verify timestamp value is set
      expect(params.ExpressionAttributeValues[':updatedAt_ts']).toEqual('2024-01-15T10:00:00.000Z');
    });
  });

  describe('Pagination Feature', () => {
    test('query should support startFrom for pagination', () => {
      const lastKey = {
        PK: 'USER#alice',
        SK: 'POST#01234567890',
      };

      const params = table.entities.Post.query()
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .limit(10)
        .startFrom(lastKey)
        .dbParams();

      expect(params.ExclusiveStartKey).toEqual(lastKey);
      expect(params.Limit).toBe(10);
    });

    test('executeWithPagination should return items and pagination metadata', async () => {
      const mockItems = [
        {
          PK: 'USER#alice',
          SK: 'POST#001',
          username: 'alice',
          postId: '001',
          title: 'Post 1',
          createdAt: new Date('2024-01-15T10:00:00.000Z'),
          updatedAt: new Date('2024-01-15T10:00:00.000Z'),
        },
        {
          PK: 'USER#alice',
          SK: 'POST#002',
          username: 'alice',
          postId: '002',
          title: 'Post 2',
          createdAt: new Date('2024-01-15T10:05:00.000Z'),
          updatedAt: new Date('2024-01-15T10:05:00.000Z'),
        },
      ];

      const lastKey = {
        PK: 'USER#alice',
        SK: 'POST#002',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        LastEvaluatedKey: lastKey,
        Count: 2,
        ScannedCount: 2,
      });

      const result = await table.entities.Post.query()
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .limit(2)
        .executeWithPagination();

      expect(result.items).toHaveLength(2);
      expect(result.lastEvaluatedKey).toEqual(lastKey);
      expect(result.count).toBe(2);
      expect(result.scannedCount).toBe(2);
    });

    test('pagination workflow with multiple pages', async () => {
      const page1 = [
        {
          PK: 'USER#alice',
          SK: 'POST#001',
          username: 'alice',
          postId: '001',
          title: 'Post 1',
        },
        {
          PK: 'USER#alice',
          SK: 'POST#002',
          username: 'alice',
          postId: '002',
          title: 'Post 2',
        },
      ];
      const page1LastKey = { PK: 'USER#alice', SK: 'POST#002' };

      const page2 = [
        {
          PK: 'USER#alice',
          SK: 'POST#003',
          username: 'alice',
          postId: '003',
          title: 'Post 3',
        },
        {
          PK: 'USER#alice',
          SK: 'POST#004',
          username: 'alice',
          postId: '004',
          title: 'Post 4',
        },
      ];
      const page2LastKey = { PK: 'USER#alice', SK: 'POST#004' };

      const page3 = [
        {
          PK: 'USER#alice',
          SK: 'POST#005',
          username: 'alice',
          postId: '005',
          title: 'Post 5',
        },
      ];

      ddbMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: page1,
          LastEvaluatedKey: page1LastKey,
          Count: 2,
          ScannedCount: 2,
        })
        .resolvesOnce({
          Items: page2,
          LastEvaluatedKey: page2LastKey,
          Count: 2,
          ScannedCount: 2,
        })
        .resolvesOnce({
          Items: page3,
          Count: 1,
          ScannedCount: 1,
        });

      const allItems: any[] = [];
      let lastKey: any;

      // Page 1
      const result1 = await table.entities.Post.query()
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .limit(2)
        .executeWithPagination();

      allItems.push(...result1.items);
      lastKey = result1.lastEvaluatedKey;
      expect(lastKey).toBeDefined();

      // Page 2
      const result2 = await table.entities.Post.query()
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .limit(2)
        .startFrom(lastKey)
        .executeWithPagination();

      allItems.push(...result2.items);
      lastKey = result2.lastEvaluatedKey;
      expect(lastKey).toBeDefined();

      // Page 3 (final)
      const result3 = await table.entities.Post.query()
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .limit(2)
        .startFrom(lastKey)
        .executeWithPagination();

      allItems.push(...result3.items);
      lastKey = result3.lastEvaluatedKey;
      expect(lastKey).toBeUndefined();

      // Verify all items collected
      expect(allItems).toHaveLength(5);
      expect(allItems.map((item) => item.postId)).toEqual(['001', '002', '003', '004', '005']);
    });

    test('pagination should work with filters', () => {
      const lastKey = { PK: 'USER#alice', SK: 'POST#010' };

      const params = table.entities.Post.query()
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .limit(5)
        .startFrom(lastKey)
        .scanIndexForward(false)
        .dbParams();

      expect(params.ExclusiveStartKey).toEqual(lastKey);
      expect(params.Limit).toBe(5);
      expect(params.ScanIndexForward).toBe(false);
    });
  });

  describe('Combined Timestamps and Pagination', () => {
    test('paginated results should include timestamp fields', async () => {
      const mockItems = [
        {
          PK: 'USER#alice',
          SK: 'POST#001',
          username: 'alice',
          postId: '001',
          title: 'Post 1',
          createdAt: new Date('2024-01-15T10:00:00.000Z'),
          updatedAt: new Date('2024-01-15T10:00:00.000Z'),
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
      });

      const result = await table.entities.Post.query()
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .executeWithPagination();

      //Fixme createdAt and updatedAt are missing in the result items, we need to infer them
      expect((result.items[0] as any).createdAt).toBeDefined();
      expect((result.items[0] as any).updatedAt).toBeDefined();
    });

    test('should be able to select timestamp fields in projection', () => {
      const params = table.entities.Post.query()
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .select(['postId', 'title', 'createdAt', 'updatedAt'] as any)
        .dbParams();

      expect(params.ProjectionExpression).toContain('createdAt');
      expect(params.ProjectionExpression).toContain('updatedAt');
    });
  });
});
