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
    PK: string;
    SK: string;
    username: string;
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
      const startKey = { PK: 'USER#alice', SK: 'USER#alice' };
      const params = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .startFrom(startKey)
        .dbParams();

      expect(params.ExclusiveStartKey).toEqual(startKey);
    });

    test('should work with all other query options', () => {
      const startKey = { PK: 'USER#alice', SK: 'USER#alice' };
      const params = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .startFrom(startKey)
        .limit(10)
        .scanIndexForward(false)
        .select(['name', 'age'])
        .dbParams();

      expect(params.ExclusiveStartKey).toEqual(startKey);
      expect(params.Limit).toBe(10);
      expect(params.ScanIndexForward).toBe(false);
      expect(params.ProjectionExpression).toBe('#name, #age');
      expect(params.ExpressionAttributeNames).toEqual(
        expect.objectContaining({
          '#name': 'name',
          '#age': 'age',
        })
      );
    });

    test('should not include ExclusiveStartKey if not set', () => {
      const params = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .dbParams();

      expect(params.ExclusiveStartKey).toBeUndefined();
    });
  });

  describe('executeWithPagination method', () => {
    test('should return items and lastEvaluatedKey', async () => {
      const mockItems = [
        { PK: 'USER#alice', SK: 'USER#alice', name: 'Alice' },
        { PK: 'USER#bob', SK: 'USER#bob', name: 'Bob' },
      ];
      const mockLastKey = { PK: 'USER#bob', SK: 'USER#bob' };

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        LastEvaluatedKey: mockLastKey,
        Count: 2,
        ScannedCount: 2,
      });

      const result = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.username, 'alice'))
        .limit(2)
        .executeWithPagination();

      expect(result.items).toEqual(mockItems);
      expect(result.lastEvaluatedKey).toEqual(mockLastKey);
      expect(result.count).toBe(2);
      expect(result.scannedCount).toBe(2);
    });

    test('should return undefined lastEvaluatedKey when no more results', async () => {
      const mockItems = [{ PK: 'USER#alice', SK: 'USER#alice', name: 'Alice' }];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
        ScannedCount: 1,
      });

      const result = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.username, 'alice'))
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
        .where((attr, op) => op.eq(attr.username, 'nonexistent'))
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
        { PK: 'USER#1', SK: 'USER#1', name: 'User 1' },
        { PK: 'USER#2', SK: 'USER#2', name: 'User 2' },
      ];
      const page1LastKey = { PK: 'USER#2', SK: 'USER#2' };

      // Second page
      const page2Items = [
        { PK: 'USER#3', SK: 'USER#3', name: 'User 3' },
        { PK: 'USER#4', SK: 'USER#4', name: 'User 4' },
      ];
      const page2LastKey = { PK: 'USER#4', SK: 'USER#4' };

      // Third page (last)
      const page3Items = [{ PK: 'USER#5', SK: 'USER#5', name: 'User 5' }];

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
        .where((attr, op) => op.beginsWith(attr.username, ''))
        .limit(2)
        .executeWithPagination();

      allItems.push(...result1.items);
      lastKey = result1.lastEvaluatedKey;
      expect(lastKey).toBeDefined();

      // Page 2
      const result2 = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.username, ''))
        .limit(2)
        .startFrom(lastKey)
        .executeWithPagination();

      allItems.push(...result2.items);
      lastKey = result2.lastEvaluatedKey;
      expect(lastKey).toBeDefined();

      // Page 3
      const result3 = await createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.username, ''))
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

  describe('requires a partition-key condition', () => {
    test('throws when where() only references non-key attributes', () => {
      const builder = createQueryBuilder<TestModel>(tableName, client, testModel).where(
        (attr, op) => op.eq(attr.status, 'active')
      );

      expect(() => builder.dbParams()).toThrow(/partition key/i);
    });

    test('error message lists the available key field names from the model', () => {
      const builder = createQueryBuilder<TestModel>(tableName, client, testModel).where(
        (attr, op) => op.eq(attr.status, 'active')
      );

      expect(() => builder.dbParams()).toThrow(/username/);
    });

    test('error message points users at scan() as the alternative', () => {
      const builder = createQueryBuilder<TestModel>(tableName, client, testModel).where(
        (attr, op) => op.eq(attr.status, 'active')
      );

      expect(() => builder.dbParams()).toThrow(/scan\(\)/);
    });

    test('error message references the index name when querying a GSI', () => {
      const modelWithIndex: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${username}' },
          SK: { type: String, value: 'USER#${username}' },
        },
        index: {
          GSI1PK: { type: String, value: 'EMAIL#${email}' },
          GSI1SK: { type: String, value: 'USER#${username}' },
        },
        attributes: {
          username: { type: String, required: true },
          email: { type: String, required: true },
          status: { type: String },
        },
      };

      const builder = createQueryBuilder<TestModel & { email: string }>(
        tableName,
        client,
        modelWithIndex
      )
        .where((attr, op) => op.eq(attr.status, 'active'))
        .useIndex('GSI1');

      expect(() => builder.dbParams()).toThrow(/GSI1/);
      // The hint should mention the GSI's template vars, not the table's.
      expect(() => builder.dbParams()).toThrow(/email/);
    });

    test('does NOT throw when the where condition matches a key template variable', () => {
      const builder = createQueryBuilder<TestModel>(tableName, client, testModel).where(
        (attr, op) => op.eq(attr.username, 'alice')
      );

      expect(() => builder.dbParams()).not.toThrow();
    });
  });

  describe('Immutability', () => {
    test('should create new builder instance when using startFrom', () => {
      const builder1 = createQueryBuilder<TestModel>(tableName, client, testModel).where(
        (attr, op) => op.eq(attr.username, 'alice')
      );

      const startKey = { PK: 'USER#alice', SK: 'USER#alice' };
      const builder2 = builder1.startFrom(startKey);

      expect(builder1.dbParams().ExclusiveStartKey).toBeUndefined();
      expect(builder2.dbParams().ExclusiveStartKey).toEqual(startKey);
    });
  });

  describe('iterate method', () => {
    test('walks every page transparently and yields items in order', async () => {
      const page1 = [
        { PK: 'USER#1', SK: 'USER#1', name: 'User 1' },
        { PK: 'USER#2', SK: 'USER#2', name: 'User 2' },
      ];
      const page2 = [
        { PK: 'USER#3', SK: 'USER#3', name: 'User 3' },
        { PK: 'USER#4', SK: 'USER#4', name: 'User 4' },
      ];
      const page3 = [{ PK: 'USER#5', SK: 'USER#5', name: 'User 5' }];

      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: page1, LastEvaluatedKey: { PK: 'USER#2', SK: 'USER#2' } })
        .resolvesOnce({ Items: page2, LastEvaluatedKey: { PK: 'USER#4', SK: 'USER#4' } })
        .resolvesOnce({ Items: page3 });

      const collected: TestModel[] = [];
      for await (const item of createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.username, ''))
        .iterate()) {
        collected.push(item);
      }

      expect(collected).toHaveLength(5);
      expect(collected.map((u) => u.name)).toEqual([
        'User 1',
        'User 2',
        'User 3',
        'User 4',
        'User 5',
      ]);
      expect(ddbMock.calls()).toHaveLength(3);
    });

    test('forwards ExclusiveStartKey from each response into the next call', async () => {
      const cursor1 = { PK: 'USER#2', SK: 'USER#2' };
      const cursor2 = { PK: 'USER#4', SK: 'USER#4' };

      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [{ PK: 'USER#1', SK: 'USER#1' }], LastEvaluatedKey: cursor1 })
        .resolvesOnce({ Items: [{ PK: 'USER#3', SK: 'USER#3' }], LastEvaluatedKey: cursor2 })
        .resolvesOnce({ Items: [{ PK: 'USER#5', SK: 'USER#5' }] });

      const iterator = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.username, ''))
        .iterate();

      // Consume the iterator
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of iterator) {
        // drain
      }

      const calls = ddbMock.calls();
      expect(calls).toHaveLength(3);
      expect((calls[0]!.args[0].input as any).ExclusiveStartKey).toBeUndefined();
      expect((calls[1]!.args[0].input as any).ExclusiveStartKey).toEqual(cursor1);
      expect((calls[2]!.args[0].input as any).ExclusiveStartKey).toEqual(cursor2);
    });

    test('starts from the user-provided cursor on the first call', async () => {
      const startKey = { PK: 'USER#10', SK: 'USER#10' };

      ddbMock.on(QueryCommand).resolves({ Items: [{ PK: 'USER#11', SK: 'USER#11' }] });

      const iterator = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.username, ''))
        .startFrom(startKey)
        .iterate();

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of iterator) {
        // drain
      }

      const calls = ddbMock.calls();
      expect((calls[0]!.args[0].input as any).ExclusiveStartKey).toEqual(startKey);
    });

    test('break out of the loop stops further DynamoDB calls', async () => {
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: [
            { PK: 'USER#1', SK: 'USER#1', name: 'User 1' },
            { PK: 'USER#2', SK: 'USER#2', name: 'User 2' },
          ],
          LastEvaluatedKey: { PK: 'USER#2', SK: 'USER#2' },
        });

      const collected: TestModel[] = [];
      for await (const item of createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.username, ''))
        .iterate()) {
        collected.push(item);
        if (collected.length >= 1) break;
      }

      expect(collected).toHaveLength(1);
      expect(ddbMock.calls()).toHaveLength(1);
    });

    test('handles an empty result without making extra calls', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const collected: TestModel[] = [];
      for await (const item of createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.eq(attr.username, 'nonexistent'))
        .iterate()) {
        collected.push(item);
      }

      expect(collected).toEqual([]);
      expect(ddbMock.calls()).toHaveLength(1);
    });
  });
});

describe('QueryBuilder - GSI key recognition', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface UserModel {
    id: string;
    email: string;
    name?: string;
  }

  const modelWithIndex: ModelDefinition = {
    key: {
      PK: { type: String, value: 'USER#${id}' },
      SK: { type: String, value: 'USER#${id}' },
    },
    index: {
      GSI1PK: { type: String, value: 'EMAIL#${email}' },
      GSI1SK: { type: String, value: 'EMAIL#${email}' },
    },
    attributes: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String },
    },
  };

  test('should place GSI index attribute into KeyConditionExpression when useIndex is set', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, modelWithIndex)
      .where((attr, op) => op.eq(attr.email, 'alice@example.com'))
      .useIndex('GSI1')
      .dbParams();

    // email should be recognized as a key field via model.index and placed in KeyConditionExpression
    expect(params.KeyConditionExpression).toBeDefined();
    expect(params.KeyConditionExpression).toContain('#GSI1PK');
    expect(params.ExpressionAttributeValues).toBeDefined();
    // The value should have the template applied
    expect(Object.values(params.ExpressionAttributeValues!)).toContain('EMAIL#alice@example.com');
    // It should NOT be in FilterExpression
    expect(params.FilterExpression).toBeUndefined();
    expect(params.IndexName).toBe('GSI1');
  });

  test('should place GSI attribute into FilterExpression when NO index is specified', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, modelWithIndex)
      .where((attr, op) => op.and(op.eq(attr.id, '123'), op.eq(attr.email, 'alice@example.com')))
      .dbParams();

    // id maps to PK -> KeyConditionExpression
    expect(params.KeyConditionExpression).toBeDefined();
    expect(params.KeyConditionExpression).toContain('#PK');
    // email is NOT a primary key field, so without useIndex it goes to filter
    expect(params.FilterExpression).toBeDefined();
    expect(params.FilterExpression).toContain('#email');
  });

  test('should handle both primary key and GSI key fields together with useIndex', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, modelWithIndex)
      .where((attr, op) => op.and(op.eq(attr.email, 'alice@example.com'), op.eq(attr.id, '123')))
      .useIndex('GSI1')
      .dbParams();

    // Both should be key conditions: email via index, id via primary key
    expect(params.KeyConditionExpression).toBeDefined();
    expect(params.KeyConditionExpression).toContain('#GSI1PK');
    expect(params.KeyConditionExpression).toContain('#PK');
    expect(params.FilterExpression).toBeUndefined();
  });
});

describe('QueryBuilder - non-conventional index key names', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface UserModel {
    id: string;
    spotifyId: string;
    name?: string;
  }

  // Non-conventional names: index is "BySpotifyId" but its keys are
  // `lookupPK` / `lookupSK` (not `BySpotifyIdPK` / `BySpotifyIdSK`).
  // Resolution must rely on the explicit `indexName` field.
  const modelWithCustomIndexNames: ModelDefinition = {
    key: {
      PK: { type: String, value: 'USER#${id}' },
      SK: { type: String, value: 'USER#${id}' },
    },
    index: {
      lookupPK: { type: String, value: 'SPOTIFY#${spotifyId}', indexName: 'BySpotifyId' },
      lookupSK: { type: String, value: 'SPOTIFY#${spotifyId}', indexName: 'BySpotifyId' },
    },
    attributes: {
      id: { type: String, required: true },
      spotifyId: { type: String, required: true },
      name: { type: String },
    },
  };

  test('resolves the index key by explicit `indexName`, not by prefix-matching the key name', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, modelWithCustomIndexNames)
      .where((attr, op) => op.eq(attr.spotifyId, '6rqhFgbbKwnb9MLmUQDhG6'))
      .useIndex('BySpotifyId')
      .dbParams();

    expect(params.IndexName).toBe('BySpotifyId');
    expect(params.KeyConditionExpression).toBeDefined();
    expect(params.KeyConditionExpression).toContain('#lookupPK');
    expect(params.FilterExpression).toBeUndefined();
    expect(Object.values(params.ExpressionAttributeValues!)).toContain(
      'SPOTIFY#6rqhFgbbKwnb9MLmUQDhG6'
    );
  });

  test('error message lists the index template variables when the where clause misses them', () => {
    const builder = createQueryBuilder<UserModel & { name: string }>(
      tableName,
      client,
      modelWithCustomIndexNames
    )
      .where((attr, op) => op.eq(attr.name, 'alice'))
      .useIndex('BySpotifyId');

    expect(() => builder.dbParams()).toThrow(/spotifyId/);
  });
});

describe('QueryBuilder - prefix-colliding index names (GSI1 vs GSI10)', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface UserModel {
    id: string;
    email: string;
    handle: string;
  }

  // Two indexes whose names share a prefix: `GSI1` and `GSI10`. With the old
  // `keyName.startsWith(indexName)` logic, querying GSI1 would also match
  // GSI10's keys. The fix uses an exact `<indexName>PK`/`<indexName>SK`
  // suffix check instead.
  const modelWithCollidingIndexes: ModelDefinition = {
    key: {
      PK: { type: String, value: 'USER#${id}' },
      SK: { type: String, value: 'USER#${id}' },
    },
    index: {
      GSI1PK: { type: String, value: 'EMAIL#${email}' },
      GSI1SK: { type: String, value: 'EMAIL#${email}' },
      GSI10PK: { type: String, value: 'HANDLE#${handle}' },
      GSI10SK: { type: String, value: 'HANDLE#${handle}' },
    },
    attributes: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      handle: { type: String, required: true },
    },
  };

  test('querying GSI1 only resolves GSI1 keys (not GSI10)', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, modelWithCollidingIndexes)
      .where((attr, op) => op.eq(attr.email, 'alice@example.com'))
      .useIndex('GSI1')
      .dbParams();

    expect(params.IndexName).toBe('GSI1');
    expect(params.KeyConditionExpression).toContain('#GSI1PK');
    expect(params.KeyConditionExpression).not.toContain('#GSI10PK');
    expect(Object.values(params.ExpressionAttributeValues!)).toContain('EMAIL#alice@example.com');
  });

  test('querying GSI1 with a GSI10-only attribute treats it as a non-key filter', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, modelWithCollidingIndexes)
      .where((attr, op) => op.and(op.eq(attr.email, 'alice@example.com'), op.eq(attr.handle, 'a')))
      .useIndex('GSI1')
      .dbParams();

    expect(params.KeyConditionExpression).toContain('#GSI1PK');
    expect(params.FilterExpression).toContain('#handle');
    expect(params.KeyConditionExpression).not.toContain('#GSI10');
  });

  test('querying GSI10 only resolves GSI10 keys (not GSI1)', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, modelWithCollidingIndexes)
      .where((attr, op) => op.eq(attr.handle, 'alice'))
      .useIndex('GSI10')
      .dbParams();

    expect(params.IndexName).toBe('GSI10');
    expect(params.KeyConditionExpression).toContain('#GSI10PK');
    expect(params.KeyConditionExpression).not.toContain('#GSI1PK ');
    expect(Object.values(params.ExpressionAttributeValues!)).toContain('HANDLE#alice');
  });

  test('error hint for GSI1 mentions only its own template vars', () => {
    const builder = createQueryBuilder<UserModel & { other: string }>(
      tableName,
      client,
      modelWithCollidingIndexes
    )
      .where((attr, op) => op.eq(attr.other, 'x'))
      .useIndex('GSI1');

    expect(() => builder.dbParams()).toThrow(/email/);
    // Should NOT mention `handle` (which only belongs to GSI10).
    expect(() => builder.dbParams()).not.toThrow(/handle/);
  });
});

describe('QueryBuilder - multi-variable key templates', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface AirportResource {
    id: string;
    airport: string;
    category: string;
    code: string;
    status: string;
  }

  const airportResourceModel: ModelDefinition = {
    key: {
      PK: { type: String, value: 'AIRPORT_RESOURCE#${id}' },
      SK: { type: String, value: 'AIRPORT_RESOURCE#${id}' },
    },
    index: {
      GSI1PK: { type: String, value: 'AIRPORT#${airport}' },
      GSI1SK: { type: String, value: 'RES#${category}#${code}' },
    },
    attributes: {
      id: { type: String, required: true },
      airport: { type: String, required: true },
      category: { type: String, required: true },
      code: { type: String, required: true },
      status: { type: String, required: true },
    },
  };

  test('beginsWith on attribute that is part of multi-var template should truncate at the first unfilled variable', () => {
    const params = createQueryBuilder<AirportResource>(tableName, client, airportResourceModel)
      .where((attr, op) =>
        op.and(op.eq(attr.airport, 'EZE'), op.beginsWith(attr.category, 'GPU'))
      )
      .useIndex('GSI1')
      .dbParams();

    expect(params.KeyConditionExpression).toBeDefined();
    expect(params.KeyConditionExpression).toContain('#GSI1PK');
    expect(params.KeyConditionExpression).toContain('begins_with(#GSI1SK');
    expect(params.IndexName).toBe('GSI1');

    const values = params.ExpressionAttributeValues ?? {};
    expect(Object.values(values)).toContain('AIRPORT#EZE');
    // Should be the prefix up to the next unfilled var, NOT 'RES#GPU#${code}'
    expect(Object.values(values)).toContain('RES#GPU#');
    expect(Object.values(values).every((v) => !String(v).includes('${'))).toBe(true);
  });

  test('eq on attribute with multi-var template should throw a clear error', () => {
    expect(() =>
      createQueryBuilder<AirportResource>(tableName, client, airportResourceModel)
        .where((attr, op) => op.eq(attr.category, 'GPU'))
        .useIndex('GSI1')
        .dbParams()
    ).toThrow(/template/i);
  });

  test('beginsWith on a single-var template still works (no truncation needed)', () => {
    const params = createQueryBuilder<AirportResource>(tableName, client, airportResourceModel)
      .where((attr, op) => op.beginsWith(attr.airport, 'EZ'))
      .useIndex('GSI1')
      .dbParams();

    const values = params.ExpressionAttributeValues ?? {};
    expect(Object.values(values)).toContain('AIRPORT#EZ');
  });
});

describe('QueryBuilder - entity type auto filter', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface AirportPersonnel {
    id: string;
    airport: string;
    role: string;
  }

  // Mirrors the reported scenario: PK is entity-specific, GSI1 is shared
  // across multiple entities (Airport, AirportPersonnel, etc.)
  const airportPersonnelModel: ModelDefinition = {
    key: {
      PK: { type: String, value: 'AIRPORT_PERSONNEL#${id}' },
      SK: { type: String, value: 'AIRPORT_PERSONNEL#${id}' },
    },
    index: {
      GSI1PK: { type: String, value: 'AIRPORT#${airport}' },
      GSI1SK: { type: String, value: 'PERSONNEL#${role}' },
    },
    attributes: {
      id: { type: String, required: true },
      airport: { type: String, required: true },
      role: { type: String, required: true },
    },
  };

  test('does NOT add _type filter when entityType is not provided (back-compat)', () => {
    const params = createQueryBuilder<AirportPersonnel>(
      tableName,
      client,
      airportPersonnelModel
    )
      .where((attr, op) => op.eq(attr.airport, 'EZE'))
      .useIndex('GSI1')
      .dbParams();

    expect(params.FilterExpression).toBeUndefined();
    const names = params.ExpressionAttributeNames ?? {};
    expect(names['#_type']).toBeUndefined();
  });

  test('adds _type filter when entityType is provided and there are no other filters', () => {
    const params = createQueryBuilder<AirportPersonnel>(
      tableName,
      client,
      airportPersonnelModel,
      undefined,
      'AirportPersonnel'
    )
      .where((attr, op) => op.eq(attr.airport, 'EZE'))
      .useIndex('GSI1')
      .dbParams();

    // Key cond goes to KeyConditionExpression, _type goes to FilterExpression
    expect(params.KeyConditionExpression).toBeDefined();
    expect(params.KeyConditionExpression).toContain('#GSI1PK');
    expect(params.FilterExpression).toBe('#_type = :_type');
    expect(params.ExpressionAttributeNames?.['#_type']).toBe('_type');
    expect(params.ExpressionAttributeValues?.[':_type']).toBe('AirportPersonnel');
  });

  test('combines _type filter with a user-provided non-key filter via AND', () => {
    const params = createQueryBuilder<AirportPersonnel & { status?: string }>(
      tableName,
      client,
      airportPersonnelModel,
      undefined,
      'AirportPersonnel'
    )
      .where((attr, op) => op.and(op.eq(attr.airport, 'EZE'), op.eq(attr.status, 'active')))
      .useIndex('GSI1')
      .dbParams();

    expect(params.KeyConditionExpression).toContain('#GSI1PK');
    expect(params.FilterExpression).toBeDefined();
    expect(params.FilterExpression).toContain('#status');
    expect(params.FilterExpression).toContain('#_type = :_type');
    expect(params.ExpressionAttributeValues?.[':_type']).toBe('AirportPersonnel');
  });

  test('repro of reported bug: GSI1 query with conditional beginsWith still filters by _type', () => {
    // The exact shape from the user report:
    //   .where((attr, op) =>
    //     role
    //       ? op.and(op.eq(attr.airport, airport), op.beginsWith(attr.role, role))
    //       : op.eq(attr.airport, airport)
    //   )
    const airport = 'EZE';
    const role = 'PILOT';

    const params = createQueryBuilder<AirportPersonnel>(
      tableName,
      client,
      airportPersonnelModel,
      undefined,
      'AirportPersonnel'
    )
      .where((attr, op) =>
        role
          ? op.and(op.eq(attr.airport, airport), op.beginsWith(attr.role, role))
          : op.eq(attr.airport, airport)
      )
      .useIndex('GSI1')
      .dbParams();

    // Both airport (GSI1PK) and role (GSI1SK) become key conditions
    expect(params.KeyConditionExpression).toContain('#GSI1PK');
    expect(params.KeyConditionExpression).toContain('begins_with(#GSI1SK');
    // _type still gets enforced as a filter — this is the fix
    expect(params.FilterExpression).toBe('#_type = :_type');
    expect(params.ExpressionAttributeValues?.[':_type']).toBe('AirportPersonnel');
  });

  test('does not collide with user attribute placeholders', () => {
    // Confirm the auto-injected names/values don't clash with user-supplied ones
    const params = createQueryBuilder<AirportPersonnel & { status?: string }>(
      tableName,
      client,
      airportPersonnelModel,
      undefined,
      'AirportPersonnel'
    )
      .where((attr, op) => op.and(op.eq(attr.airport, 'EZE'), op.eq(attr.status, 'active')))
      .useIndex('GSI1')
      .dbParams();

    expect(params.ExpressionAttributeNames?.['#_type']).toBe('_type');
    expect(params.ExpressionAttributeNames?.['#status']).toBe('status');
    expect(params.ExpressionAttributeValues?.[':_type']).toBe('AirportPersonnel');
  });
});

describe('QueryBuilder - literal-template hash key auto-injection', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  // Mirrors the reported scenario: GSI1PK is a static entity-type marker
  // shared across rows ("AIRPORT"), with the variability living on the SK.
  // The user can't reference 'AIRPORT' via attr.* because it isn't a model
  // attribute, so the builder must inject `#GSI1PK = 'AIRPORT'` itself.
  interface Airport {
    code: string;
    region: string;
    country: string;
    status: string;
  }

  const airportModel: ModelDefinition = {
    key: {
      PK: { type: String, value: 'AIRPORT#${code}' },
      SK: { type: String, value: 'AIRPORT#${code}' },
    },
    index: {
      GSI1PK: { type: String, value: 'AIRPORT' },
      GSI1SK: { type: String, value: '${region}#${country}' },
    },
    attributes: {
      code: { type: String, required: true },
      region: { type: String, required: true },
      country: { type: String, required: true },
      status: { type: String, required: true },
    },
  };

  test('repro: beginsWith on the SK template var succeeds with auto-injected literal PK', () => {
    const params = createQueryBuilder<Airport>(tableName, client, airportModel)
      .where((attr, op) => op.beginsWith(attr.region, 'SOUTH_AMERICA'))
      .useIndex('GSI1')
      .dbParams();

    expect(params.KeyConditionExpression).toBeDefined();
    expect(params.KeyConditionExpression).toContain('#GSI1PK = :GSI1PK_literal');
    expect(params.KeyConditionExpression).toContain('begins_with(#GSI1SK');
    expect(params.ExpressionAttributeNames?.['#GSI1PK']).toBe('GSI1PK');
    expect(params.ExpressionAttributeValues?.[':GSI1PK_literal']).toBe('AIRPORT');
    // beginsWith on a multi-var SK template truncates at the next ${...}
    // — see applyKeyTemplate; expected prefix is 'SOUTH_AMERICA#'.
    expect(Object.values(params.ExpressionAttributeValues ?? {})).toContain('SOUTH_AMERICA#');
    expect(params.IndexName).toBe('GSI1');
  });

  test('auto-injects the literal PK even when the user only constrains a non-key attribute', () => {
    // The where clause references `status`, which is not a key var — it
    // becomes a FilterExpression. Without auto-injection, separateConditions
    // produces zero key conditions and the friendly error fires. With it,
    // the query degrades cleanly to "fetch every AIRPORT row" with a
    // server-side filter on status.
    const params = createQueryBuilder<Airport>(tableName, client, airportModel)
      .where((attr, op) => op.eq(attr.status, 'OPEN'))
      .useIndex('GSI1')
      .dbParams();

    expect(params.KeyConditionExpression).toContain('#GSI1PK = :GSI1PK_literal');
    expect(params.ExpressionAttributeValues?.[':GSI1PK_literal']).toBe('AIRPORT');
    expect(params.FilterExpression).toContain('#status');
  });

  test('still throws the friendly error when no key condition can be derived AND no literal hash key exists', () => {
    // No literal hash key on this model — the PK template references id.
    const userModel: ModelDefinition = {
      key: {
        PK: { type: String, value: 'USER#${id}' },
        SK: { type: String, value: 'USER#${id}' },
      },
      attributes: {
        id: { type: String, required: true },
        status: { type: String },
      },
    };

    const builder = createQueryBuilder<{ id: string; status: string }>(
      tableName,
      client,
      userModel
    ).where((attr, op) => op.eq(attr.status, 'active'));

    expect(() => builder.dbParams()).toThrow(/partition key/i);
  });

  test('primary key with a literal PK template also gets auto-injected', () => {
    // PK literal on the primary index (not just GSIs). Rare but valid.
    const singletonModel: ModelDefinition = {
      key: {
        PK: { type: String, value: 'CONFIG' },
        SK: { type: String, value: 'V#${version}' },
      },
      attributes: {
        version: { type: String, required: true },
      },
    };

    const params = createQueryBuilder<{ version: string }>(tableName, client, singletonModel)
      .where((attr, op) => op.beginsWith(attr.version, '2'))
      .dbParams();

    expect(params.KeyConditionExpression).toContain('#PK = :PK_literal');
    expect(params.KeyConditionExpression).toContain('begins_with(#SK');
    expect(params.ExpressionAttributeValues?.[':PK_literal']).toBe('CONFIG');
  });

  test('does NOT auto-inject when the PK template is not literal (back-compat)', () => {
    // Sanity check: pre-existing model with vars in PK keeps current behavior.
    const userModel: ModelDefinition = {
      key: {
        PK: { type: String, value: 'USER#${id}' },
        SK: { type: String, value: 'USER#${id}' },
      },
      attributes: {
        id: { type: String, required: true },
      },
    };

    const params = createQueryBuilder<{ id: string }>(tableName, client, userModel)
      .where((attr, op) => op.eq(attr.id, 'alice'))
      .dbParams();

    expect(params.ExpressionAttributeNames?.['#PK_literal']).toBeUndefined();
    expect(params.ExpressionAttributeValues?.[':PK_literal']).toBeUndefined();
    // The id-bearing condition was rewritten to the PK as usual.
    expect(params.KeyConditionExpression).toContain('#PK');
  });

  test('literal SK marker is auto-injected (canonical UserProfile pattern from docs)', () => {
    // Pattern straight from apps/docs/docs/guides/data-modeling.md:118 —
    // separate UserProfile entity sitting under the User partition. Before
    // auto-injection, `.entities.UserProfile.query()` would scan every
    // item under USER#id and post-filter by _type; after, the literal SK
    // becomes an equality condition that fetches just the profile row.
    interface UserProfile {
      userId: string;
      bio: string;
    }

    const userProfileModel: ModelDefinition = {
      key: {
        PK: { type: String, value: 'USER#${userId}' },
        SK: { type: String, value: 'PROFILE' },
      },
      attributes: {
        userId: { type: String, required: true },
        bio: { type: String, required: true },
      },
    };

    const params = createQueryBuilder<UserProfile>(tableName, client, userProfileModel)
      .where((attr, op) => op.eq(attr.userId, 'alice'))
      .dbParams();

    expect(params.KeyConditionExpression).toContain('#PK');
    expect(params.KeyConditionExpression).toContain('#SK = :SK_literal');
    expect(params.ExpressionAttributeValues?.[':SK_literal']).toBe('PROFILE');
    // PK still resolves through the user-supplied condition on userId.
    expect(Object.values(params.ExpressionAttributeValues ?? {})).toContain('USER#alice');
  });

  test('both PK and SK literal: both auto-injected, returning the unique singleton', () => {
    // Edge case: pure-singleton entity. Better suited to .get() in practice,
    // but query() shouldn't silently break for it.
    const singletonModel: ModelDefinition = {
      key: {
        PK: { type: String, value: 'CONFIG' },
        SK: { type: String, value: 'V1' },
      },
      attributes: {
        value: { type: String, required: true },
      },
    };

    const params = createQueryBuilder<{ value: string }>(
      tableName,
      client,
      singletonModel
    )
      .where((attr, op) => op.eq(attr.value, 'unused-filter'))
      .dbParams();

    expect(params.KeyConditionExpression).toContain('#PK = :PK_literal');
    expect(params.KeyConditionExpression).toContain('#SK = :SK_literal');
    expect(params.ExpressionAttributeValues?.[':PK_literal']).toBe('CONFIG');
    expect(params.ExpressionAttributeValues?.[':SK_literal']).toBe('V1');
    // The non-key attribute went to FilterExpression as expected.
    expect(params.FilterExpression).toContain('#value');
  });

  test('literal SK alone is NOT enough to satisfy the partition-key requirement', () => {
    // Edge case: SK is literal but PK has vars. If the user supplies
    // nothing key-related, auto-injecting just the SK leaves no PK
    // condition — DynamoDB would reject. We preserve the friendly error
    // instead of letting that less-helpful error escape.
    const userProfileModel: ModelDefinition = {
      key: {
        PK: { type: String, value: 'USER#${userId}' },
        SK: { type: String, value: 'PROFILE' },
      },
      attributes: {
        userId: { type: String, required: true },
        status: { type: String },
      },
    };

    const builder = createQueryBuilder<{ userId: string; status: string }>(
      tableName,
      client,
      userProfileModel
    ).where((attr, op) => op.eq(attr.status, 'active'));

    expect(() => builder.dbParams()).toThrow(/partition key/i);
    expect(() => builder.dbParams()).toThrow(/userId/);
  });

  test('non-conventional index name with literal hash (ends in PK) is auto-injected', () => {
    interface CountryRecord {
      country: string;
      name: string;
    }

    const countryModel: ModelDefinition = {
      key: {
        PK: { type: String, value: 'COUNTRY#${country}' },
        SK: { type: String, value: 'COUNTRY#${country}' },
      },
      index: {
        lookupPK: { type: String, value: 'ALL_COUNTRIES', indexName: 'ByName' },
        lookupSK: { type: String, value: '${name}', indexName: 'ByName' },
      },
      attributes: {
        country: { type: String, required: true },
        name: { type: String, required: true },
      },
    };

    const params = createQueryBuilder<CountryRecord>(tableName, client, countryModel)
      .where((attr, op) => op.beginsWith(attr.name, 'A'))
      .useIndex('ByName')
      .dbParams();

    expect(params.KeyConditionExpression).toContain('#lookupPK = :lookupPK_literal');
    expect(params.ExpressionAttributeValues?.[':lookupPK_literal']).toBe('ALL_COUNTRIES');
    expect(params.IndexName).toBe('ByName');
  });
});

describe('QueryBuilder - projection placeholders', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface UserModel {
    PK: string;
    SK: string;
    username: string;
    name?: string;
    status?: string;
    age?: number;
    type?: string;
  }

  const userModel: ModelDefinition = {
    key: {
      PK: { type: String, value: 'USER#${username}' },
      SK: { type: String, value: 'USER#${username}' },
    },
    attributes: {
      username: { type: String, required: true },
      name: { type: String },
      status: { type: String },
      age: { type: Number },
      type: { type: String },
    },
  };

  test('projects reserved DynamoDB words via #-placeholders', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, userModel)
      .where((attr, op) => op.eq(attr.username, 'alice'))
      .select(['name', 'status', 'type'])
      .dbParams();

    expect(params.ProjectionExpression).toBe('#name, #status, #type');
    expect(params.ExpressionAttributeNames).toEqual(
      expect.objectContaining({
        '#name': 'name',
        '#status': 'status',
        '#type': 'type',
      })
    );
  });

  test('merges projection names with key/filter names without clobbering', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, userModel)
      .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.gt(attr.age, 18)))
      .select(['name', 'status'])
      .dbParams();

    // Projection placeholders (#name, #status) merged with key (#PK from
    // the username→PK template rewrite) and filter (#age) — none clobbered.
    expect(params.ExpressionAttributeNames).toEqual(
      expect.objectContaining({
        '#name': 'name',
        '#status': 'status',
        '#PK': 'PK',
        '#age': 'age',
      })
    );
  });

  test('shares the same placeholder when an attribute is both projected and filtered (no key duplication)', () => {
    const params = createQueryBuilder<UserModel>(tableName, client, userModel)
      .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.eq(attr.status, 'active')))
      .select(['name', 'status'])
      .dbParams();

    // The map has #status exactly once, mapping to "status".
    expect(params.ExpressionAttributeNames!['#status']).toBe('status');
    expect(params.ProjectionExpression).toBe('#name, #status');
    expect(params.FilterExpression).toMatch(/#status = :status_\d+/);
  });
});

describe('QueryBuilder - NOT() wrapping a condition', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface TestModel {
    PK: string;
    SK: string;
    username: string;
    status?: string;
  }

  const testModel: ModelDefinition = {
    key: {
      PK: { type: String, value: 'USER#${username}' },
      SK: { type: String, value: 'USER#${username}' },
    },
    attributes: {
      username: { type: String, required: true },
      status: { type: String },
    },
  };

  test('a NOT-wrapped key condition is moved to FilterExpression (KeyConditionExpression has no NOT)', () => {
    // The user's intent: "username starts with `a` AND NOT status === 'inactive'".
    // The NOT-wrapped status filter must keep its negation; without that,
    // the query would return inactive rows too.
    const params = createQueryBuilder<TestModel>(tableName, client, testModel)
      .where((attr, op) =>
        op.and(op.beginsWith(attr.username, 'a'), op.not(op.eq(attr.status, 'inactive')))
      )
      .dbParams();

    expect(params.KeyConditionExpression).toContain('#PK');
    expect(params.FilterExpression).toBeDefined();
    expect(params.FilterExpression).toMatch(/NOT \(#status = :status_\d+\)/);
  });

  test('does not let NOT-wrapped key-field conditions sneak into KeyConditionExpression', () => {
    // Negation on a key field must go to filter, not key — the negation
    // would otherwise be silently dropped.
    const params = createQueryBuilder<TestModel>(tableName, client, testModel)
      .where((attr, op) =>
        op.and(op.beginsWith(attr.username, 'a'), op.not(op.eq(attr.username, 'admin')))
      )
      .dbParams();

    // The plain key condition stays in KeyConditionExpression.
    expect(params.KeyConditionExpression).toContain('begins_with');
    // The NOT-wrapped one moves to filter, with the negation intact.
    expect(params.FilterExpression).toMatch(/NOT \(#username = :username_\d+\)/);
  });
});

describe('QueryBuilder - returnConsumedCapacity', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface TestModel {
    PK: string;
    SK: string;
    username: string;
  }

  const testModel: ModelDefinition = {
    key: {
      PK: { type: String, value: 'USER#${username}' },
      SK: { type: String, value: 'USER#${username}' },
    },
    attributes: {
      username: { type: String, required: true },
    },
  };

  test('omits ReturnConsumedCapacity by default', () => {
    const params = createQueryBuilder<TestModel>(tableName, client, testModel)
      .where((attr, op) => op.eq(attr.username, 'alice'))
      .dbParams();
    expect(params.ReturnConsumedCapacity).toBeUndefined();
  });

  test('passes the configured mode through to dbParams', () => {
    const params = createQueryBuilder<TestModel>(tableName, client, testModel)
      .where((attr, op) => op.eq(attr.username, 'alice'))
      .returnConsumedCapacity('TOTAL')
      .dbParams();
    expect(params.ReturnConsumedCapacity).toBe('TOTAL');
  });

  test('survives further chained calls (immutability)', () => {
    const params = createQueryBuilder<TestModel>(tableName, client, testModel)
      .where((attr, op) => op.eq(attr.username, 'alice'))
      .returnConsumedCapacity('INDEXES')
      .limit(5)
      .dbParams();
    expect(params.ReturnConsumedCapacity).toBe('INDEXES');
    expect(params.Limit).toBe(5);
  });
});
