/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createBatchWriteBuilder } from './create-batch-write-builder';

describe('BatchWriteBuilder', () => {
  const client = new DynamoDBClient({});

  describe('dbParams', () => {
    test('should build basic BatchWriteItem params with PutRequests', () => {
      const requestItems = {
        Users: [
          {
            PutRequest: {
              Item: {
                pk: 'USER#alice',
                sk: 'USER#alice',
                username: 'alice',
                name: 'Alice Smith',
                followerCount: 0,
                followingCount: 0,
              },
            },
          },
          {
            PutRequest: {
              Item: {
                pk: 'USER#bob',
                sk: 'USER#bob',
                username: 'bob',
                name: 'Bob Jones',
                followerCount: 0,
                followingCount: 0,
              },
            },
          },
        ],
      };

      const builder = createBatchWriteBuilder(requestItems, client);
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: requestItems,
      });
    });

    test('should build BatchWriteItem params with DeleteRequests', () => {
      const requestItems = {
        Users: [
          {
            DeleteRequest: {
              Key: {
                pk: 'USER#alice',
                sk: 'USER#alice',
              },
            },
          },
          {
            DeleteRequest: {
              Key: {
                pk: 'USER#bob',
                sk: 'USER#bob',
              },
            },
          },
        ],
      };

      const builder = createBatchWriteBuilder(requestItems, client);
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: requestItems,
      });
    });

    test('should build BatchWriteItem params with mixed Put and Delete requests', () => {
      const requestItems = {
        Users: [
          {
            PutRequest: {
              Item: {
                pk: 'USER#alice',
                sk: 'USER#alice',
                username: 'alice',
                name: 'Alice Smith',
                followerCount: 0,
                followingCount: 0,
              },
            },
          },
          {
            DeleteRequest: {
              Key: {
                pk: 'USER#bob',
                sk: 'USER#bob',
              },
            },
          },
        ],
      };

      const builder = createBatchWriteBuilder(requestItems, client);
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: requestItems,
      });
    });

    test('should build BatchWriteItem params with multiple tables', () => {
      const requestItems = {
        Users: [
          {
            PutRequest: {
              Item: {
                pk: 'USER#alice',
                sk: 'USER#alice',
                username: 'alice',
                name: 'Alice Smith',
              },
            },
          },
        ],
        Photos: [
          {
            PutRequest: {
              Item: {
                pk: 'UP#alice',
                sk: 'PHOTO#photo1',
                username: 'alice',
                photoId: 'photo1',
                url: 'https://example.com/photo1.jpg',
                likesCount: 0,
                commentCount: 0,
              },
            },
          },
          {
            DeleteRequest: {
              Key: {
                pk: 'UP#alice',
                sk: 'PHOTO#photo2',
              },
            },
          },
        ],
      };

      const builder = createBatchWriteBuilder(requestItems, client);
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: requestItems,
      });
    });

    test('should handle empty request items', () => {
      const requestItems = {
        Users: [],
      };

      const builder = createBatchWriteBuilder(requestItems, client);
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: {
          Users: [],
        },
      });
    });
  });
});
