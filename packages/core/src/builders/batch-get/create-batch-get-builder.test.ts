/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { createBatchGetBuilder } from './create-batch-get-builder';
import { BatchUnprocessedError } from '../shared';

const ddbMock = mockClient(DynamoDBClient);

interface User {
  pk: string;
  sk: string;
  username: string;
  name: string;
  followerCount: number;
  followingCount: number;
}

describe('BatchGetBuilder', () => {
  const client = new DynamoDBClient({});

  describe('dbParams', () => {
    test('should build basic BatchGetItem params', () => {
      const requestItems = {
        Users: {
          Keys: [
            { pk: 'USER#alice', sk: 'USER#alice' },
            { pk: 'USER#bob', sk: 'USER#bob' },
          ],
        },
      };

      const builder = createBatchGetBuilder(requestItems, client);
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: {
          Users: {
            Keys: [
              { pk: 'USER#alice', sk: 'USER#alice' },
              { pk: 'USER#bob', sk: 'USER#bob' },
            ],
          },
        },
      });
    });

    test('should build BatchGetItem params with projection', () => {
      const requestItems = {
        Users: {
          Keys: [
            { pk: 'USER#alice', sk: 'USER#alice' },
            { pk: 'USER#bob', sk: 'USER#bob' },
          ],
        },
      };

      const builder = createBatchGetBuilder<User>(requestItems, client).select([
        'username',
        'name',
        'followerCount',
      ]);
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: {
          Users: {
            Keys: [
              { pk: 'USER#alice', sk: 'USER#alice' },
              { pk: 'USER#bob', sk: 'USER#bob' },
            ],
            ProjectionExpression: '#username, #name, #followerCount',
            ExpressionAttributeNames: {
              '#username': 'username',
              '#name': 'name',
              '#followerCount': 'followerCount',
            },
          },
        },
      });
    });

    test('should build BatchGetItem params with consistent read', () => {
      const requestItems = {
        Users: {
          Keys: [
            { pk: 'USER#alice', sk: 'USER#alice' },
            { pk: 'USER#bob', sk: 'USER#bob' },
          ],
        },
      };

      const builder = createBatchGetBuilder(requestItems, client).consistentRead();
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: {
          Users: {
            Keys: [
              { pk: 'USER#alice', sk: 'USER#alice' },
              { pk: 'USER#bob', sk: 'USER#bob' },
            ],
            ConsistentRead: true,
          },
        },
      });
    });

    test('should build BatchGetItem params with multiple tables', () => {
      const requestItems = {
        Users: {
          Keys: [
            { pk: 'USER#alice', sk: 'USER#alice' },
            { pk: 'USER#bob', sk: 'USER#bob' },
          ],
        },
        Photos: {
          Keys: [
            { pk: 'UP#alice', sk: 'PHOTO#photo1' },
            { pk: 'UP#bob', sk: 'PHOTO#photo2' },
          ],
        },
      };

      const builder = createBatchGetBuilder(requestItems, client);
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: {
          Users: {
            Keys: [
              { pk: 'USER#alice', sk: 'USER#alice' },
              { pk: 'USER#bob', sk: 'USER#bob' },
            ],
          },
          Photos: {
            Keys: [
              { pk: 'UP#alice', sk: 'PHOTO#photo1' },
              { pk: 'UP#bob', sk: 'PHOTO#photo2' },
            ],
          },
        },
      });
    });

    test('should build BatchGetItem params with projection and consistent read', () => {
      const requestItems = {
        Users: {
          Keys: [
            { pk: 'USER#alice', sk: 'USER#alice' },
            { pk: 'USER#bob', sk: 'USER#bob' },
          ],
        },
      };

      const builder = createBatchGetBuilder<User>(requestItems, client)
        .select(['username', 'name'])
        .consistentRead();
      const params = builder.dbParams();

      expect(params).toEqual({
        RequestItems: {
          Users: {
            Keys: [
              { pk: 'USER#alice', sk: 'USER#alice' },
              { pk: 'USER#bob', sk: 'USER#bob' },
            ],
            ProjectionExpression: '#username, #name',
            ExpressionAttributeNames: {
              '#username': 'username',
              '#name': 'name',
            },
            ConsistentRead: true,
          },
        },
      });
    });

    test('reserved DynamoDB words like "name", "date", "status" can be projected', () => {
      const requestItems = {
        Users: {
          Keys: [{ pk: 'USER#alice', sk: 'USER#alice' }],
        },
      };

      const builder = createBatchGetBuilder<User>(requestItems, client).select(['name']);
      const params = builder.dbParams();

      expect(params.RequestItems!['Users']).toEqual({
        Keys: [{ pk: 'USER#alice', sk: 'USER#alice' }],
        ProjectionExpression: '#name',
        ExpressionAttributeNames: {
          '#name': 'name',
        },
      });
    });
  });

  describe('execute - chunking + retry', () => {
    beforeEach(() => {
      ddbMock.reset();
    });

    function makeKeys(n: number, prefix = 'u') {
      return Array.from({ length: n }, (_, i) => ({
        pk: `USER#${prefix}${i}`,
        sk: `USER#${prefix}${i}`,
      }));
    }

    test('250 keys split into 100 + 100 + 50 across three BatchGetCommand calls', async () => {
      ddbMock.on(BatchGetCommand).resolves({ Responses: { Users: [] } });
      const builder = createBatchGetBuilder<User>(
        { Users: { Keys: makeKeys(250) } },
        client
      );

      await builder.execute();

      const calls = ddbMock.commandCalls(BatchGetCommand);
      expect(calls).toHaveLength(3);
      expect((calls[0]!.args[0].input as any).RequestItems.Users.Keys).toHaveLength(100);
      expect((calls[1]!.args[0].input as any).RequestItems.Users.Keys).toHaveLength(100);
      expect((calls[2]!.args[0].input as any).RequestItems.Users.Keys).toHaveLength(50);
    });

    test('aggregates Responses across chunks into a single flat array', async () => {
      const page1 = [{ pk: 'USER#u0', sk: 'USER#u0' }];
      const page2 = [
        { pk: 'USER#u100', sk: 'USER#u100' },
        { pk: 'USER#u101', sk: 'USER#u101' },
      ];
      ddbMock
        .on(BatchGetCommand)
        .resolvesOnce({ Responses: { Users: page1 } })
        .resolvesOnce({ Responses: { Users: page2 } });

      const builder = createBatchGetBuilder<{ pk: string; sk: string }>(
        { Users: { Keys: makeKeys(150) } },
        client
      );

      const items = await builder.execute();
      expect(items).toHaveLength(3);
      expect(items.map((i) => i.pk)).toEqual(['USER#u0', 'USER#u100', 'USER#u101']);
    });

    test('retries UnprocessedKeys with eventual success', async () => {
      const keys = makeKeys(2);
      ddbMock
        .on(BatchGetCommand)
        .resolvesOnce({
          Responses: { Users: [{ pk: 'USER#u0', sk: 'USER#u0' }] },
          UnprocessedKeys: { Users: { Keys: [keys[1]!] } },
        })
        .resolvesOnce({
          Responses: { Users: [{ pk: 'USER#u1', sk: 'USER#u1' }] },
        });

      const builder = createBatchGetBuilder<{ pk: string; sk: string }>(
        { Users: { Keys: keys } },
        client
      ).retryBackoffMs(1);

      const items = await builder.execute();
      expect(items).toHaveLength(2);
      expect(ddbMock.commandCalls(BatchGetCommand)).toHaveLength(2);
    });

    test('throws BatchUnprocessedError after exhausting retries', async () => {
      const keys = makeKeys(1);
      ddbMock.on(BatchGetCommand).resolves({
        Responses: { Users: [] },
        UnprocessedKeys: { Users: { Keys: keys } },
      });

      const builder = createBatchGetBuilder<User>({ Users: { Keys: keys } }, client)
        .maxRetries(2)
        .retryBackoffMs(1);

      await expect(builder.execute()).rejects.toBeInstanceOf(BatchUnprocessedError);
      // 1 initial + 2 retries
      expect(ddbMock.commandCalls(BatchGetCommand)).toHaveLength(3);
    });
  });
});
