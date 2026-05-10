/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { Table } from '../../src/table';

/**
 * Verifies that `cleanInternalKeys: true` actually strips ALL internal columns
 * from the data returned to the consumer — including GSI hash/sort keys
 * derived from the schema, not just the hardcoded PK/SK/_type set.
 *
 * Covers the regression that GSI columns leaked through even with the flag on,
 * and the previous gap that put() and query() bypassed the cleanup entirely.
 */

const ddbMock = mockClient(DynamoDBClient);

const Schema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',
  indexes: {
    primary: { hash: 'PK', sort: 'SK' },
    gsi1: { hash: 'GSI1PK', sort: 'GSI1SK' },
  },
  models: {
    Like: {
      key: {
        PK: { type: String, value: 'PL#${photoId}' },
        SK: { type: String, value: 'LIKE#${likingUsername}' },
      },
      index: {
        GSI1PK: { type: String, value: 'PL#${photoId}' },
        GSI1SK: { type: String, value: 'LIKE#${likeId}' },
      },
      attributes: {
        photoId: { type: String, required: true },
        likingUsername: { type: String, required: true },
        likeId: { type: String, required: true },
      },
    },
  },
  params: {
    cleanInternalKeys: true,
  },
} as const;

const SchemaWithFlagOff = {
  ...Schema,
  params: { cleanInternalKeys: false },
} as const;

// Each item that DynamoDB would return on a real read — note all five
// internal columns are present.
const DDB_ITEM = {
  PK: 'PL#photo1',
  SK: 'LIKE#alice',
  GSI1PK: 'PL#photo1',
  GSI1SK: 'LIKE#01HXXXXXXXXXXXXXXXXXXXX',
  _type: 'Like',
  photoId: 'photo1',
  likingUsername: 'alice',
  likeId: '01HXXXXXXXXXXXXXXXXXXXX',
};

const DOMAIN_ITEM = {
  photoId: 'photo1',
  likingUsername: 'alice',
  likeId: '01HXXXXXXXXXXXXXXXXXXXX',
};

describe('Table — cleanInternalKeys end-to-end', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('with cleanInternalKeys: true', () => {
    const table = new Table({
      name: 'TestTable',
      client: new DynamoDBClient({}),
      schema: Schema,
    });

    test('get() strips PK, SK, _type AND GSI columns', async () => {
      ddbMock.on(GetCommand).resolves({ Item: { ...DDB_ITEM } });

      const result = await table.entities.Like.get({
        photoId: 'photo1',
        likingUsername: 'alice',
      }).execute();

      expect(result).toEqual(DOMAIN_ITEM);
      expect(result).not.toHaveProperty('GSI1PK');
      expect(result).not.toHaveProperty('GSI1SK');
    });

    test('put() strips internal keys from the returned item (regression)', async () => {
      // Prior to the fix, put() bypassed the cleanInternalKeys middleware
      // entirely and returned the raw `params.Item` (which always includes
      // PK/SK/GSI1PK/GSI1SK/_type).
      ddbMock.on(PutCommand).resolves({});

      const result = await table.entities.Like.put({
        photoId: 'photo1',
        likingUsername: 'alice',
        likeId: '01HXXXXXXXXXXXXXXXXXXXX',
      }).execute();

      expect(result).not.toHaveProperty('PK');
      expect(result).not.toHaveProperty('SK');
      expect(result).not.toHaveProperty('GSI1PK');
      expect(result).not.toHaveProperty('GSI1SK');
      expect(result).not.toHaveProperty('_type');
      expect(result).toMatchObject(DOMAIN_ITEM);
    });

    test('query() strips internal keys from each item (regression)', async () => {
      // Prior to the fix, query() bypassed the cleanInternalKeys middleware
      // and returned each row with PK/SK/GSI1PK/GSI1SK/_type intact.
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { ...DDB_ITEM, likingUsername: 'alice' },
          { ...DDB_ITEM, likingUsername: 'bob', SK: 'LIKE#bob' },
        ],
      });

      const result = await table.entities.Like.query()
        .where((attr, op) => op.eq(attr.photoId, 'photo1'))
        .execute();

      expect(result).toHaveLength(2);
      for (const item of result) {
        expect(item).not.toHaveProperty('PK');
        expect(item).not.toHaveProperty('SK');
        expect(item).not.toHaveProperty('GSI1PK');
        expect(item).not.toHaveProperty('GSI1SK');
        expect(item).not.toHaveProperty('_type');
      }
      expect(result[0]).toMatchObject({ photoId: 'photo1', likingUsername: 'alice' });
      expect(result[1]).toMatchObject({ photoId: 'photo1', likingUsername: 'bob' });
    });

    test('scan() strips internal keys', async () => {
      ddbMock.on(ScanCommand).resolves({ Items: [{ ...DDB_ITEM }] });

      const result = await table.entities.Like.scan().execute();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(DOMAIN_ITEM);
      expect(result[0]).not.toHaveProperty('GSI1PK');
    });
  });

  describe('with cleanInternalKeys: false', () => {
    const table = new Table({
      name: 'TestTable',
      client: new DynamoDBClient({}),
      schema: SchemaWithFlagOff,
    });

    test('get() preserves internal keys (opt-in flag is honored)', async () => {
      ddbMock.on(GetCommand).resolves({ Item: { ...DDB_ITEM } });

      const result = await table.entities.Like.get({
        photoId: 'photo1',
        likingUsername: 'alice',
      }).execute();

      expect(result).toMatchObject(DDB_ITEM);
      expect(result).toHaveProperty('PK');
      expect(result).toHaveProperty('GSI1PK');
    });
  });
});
