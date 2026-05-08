/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { createBatchWriteBuilder } from './create-batch-write-builder';
import { BatchUnprocessedError } from '../shared';

const ddbMock = mockClient(DynamoDBClient);

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

  describe('execute - chunking + retry', () => {
    beforeEach(() => {
      ddbMock.reset();
    });

    function makePuts(n: number, prefix = 'u') {
      return Array.from({ length: n }, (_, i) => ({
        PutRequest: { Item: { pk: `USER#${prefix}${i}`, sk: `USER#${prefix}${i}`, n: i } },
      }));
    }

    test('30 items split into 25 + 5 across two BatchWriteCommand calls', async () => {
      ddbMock.on(BatchWriteCommand).resolves({});
      const builder = createBatchWriteBuilder({ Users: makePuts(30) }, client);

      await builder.execute();

      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls).toHaveLength(2);
      expect((calls[0]!.args[0].input as any).RequestItems.Users).toHaveLength(25);
      expect((calls[1]!.args[0].input as any).RequestItems.Users).toHaveLength(5);
    });

    test('chunks across multiple tables in input order', async () => {
      ddbMock.on(BatchWriteCommand).resolves({});
      const builder = createBatchWriteBuilder(
        { Users: makePuts(20, 'u'), Photos: makePuts(20, 'p') },
        client
      );

      await builder.execute();

      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls).toHaveLength(2); // 40 items → 25 + 15
      // First chunk = 20 Users + 5 Photos
      const c0 = (calls[0]!.args[0].input as any).RequestItems;
      expect(c0.Users).toHaveLength(20);
      expect(c0.Photos).toHaveLength(5);
      // Second chunk = 15 Photos
      const c1 = (calls[1]!.args[0].input as any).RequestItems;
      expect(c1.Users).toBeUndefined();
      expect(c1.Photos).toHaveLength(15);
    });

    test('retries UnprocessedItems with eventual success', async () => {
      const items = makePuts(2);
      ddbMock
        .on(BatchWriteCommand)
        .resolvesOnce({
          UnprocessedItems: { Users: [items[0]!] },
        })
        .resolvesOnce({});

      const builder = createBatchWriteBuilder({ Users: items }, client).retryBackoffMs(1);

      await expect(builder.execute()).resolves.toEqual({});
      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls).toHaveLength(2);
      // Second call carries only the unprocessed item
      expect((calls[1]!.args[0].input as any).RequestItems.Users).toEqual([items[0]]);
    });

    test('throws BatchUnprocessedError after exhausting retries', async () => {
      const items = makePuts(1);
      ddbMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: { Users: items },
      });

      const builder = createBatchWriteBuilder({ Users: items }, client)
        .maxRetries(2)
        .retryBackoffMs(1);

      await expect(builder.execute()).rejects.toMatchObject({
        name: 'BatchUnprocessedError',
        unprocessed: { Users: items },
      });
      // 1 initial attempt + 2 retries = 3 calls
      expect(ddbMock.commandCalls(BatchWriteCommand)).toHaveLength(3);
    });

    test('BatchUnprocessedError is the exported class', async () => {
      const items = makePuts(1);
      ddbMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: { Users: items },
      });

      const builder = createBatchWriteBuilder({ Users: items }, client)
        .maxRetries(0)
        .retryBackoffMs(1);

      await expect(builder.execute()).rejects.toBeInstanceOf(BatchUnprocessedError);
    });
  });
});
