/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createBatchGetBuilder } from './create-batch-get-builder';

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
            ProjectionExpression: 'username, name, followerCount',
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
            ProjectionExpression: 'username, name',
            ConsistentRead: true,
          },
        },
      });
    });
  });
});
