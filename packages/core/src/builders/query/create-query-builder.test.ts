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

  describe('iterate method', () => {
    test('walks every page transparently and yields items in order', async () => {
      const page1 = [
        { pk: 'USER#1', sk: 'USER#1', name: 'User 1' },
        { pk: 'USER#2', sk: 'USER#2', name: 'User 2' },
      ];
      const page2 = [
        { pk: 'USER#3', sk: 'USER#3', name: 'User 3' },
        { pk: 'USER#4', sk: 'USER#4', name: 'User 4' },
      ];
      const page3 = [{ pk: 'USER#5', sk: 'USER#5', name: 'User 5' }];

      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: page1, LastEvaluatedKey: { pk: 'USER#2', sk: 'USER#2' } })
        .resolvesOnce({ Items: page2, LastEvaluatedKey: { pk: 'USER#4', sk: 'USER#4' } })
        .resolvesOnce({ Items: page3 });

      const collected: TestModel[] = [];
      for await (const item of createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.pk, 'USER#'))
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
      const cursor1 = { pk: 'USER#2', sk: 'USER#2' };
      const cursor2 = { pk: 'USER#4', sk: 'USER#4' };

      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [{ pk: 'USER#1', sk: 'USER#1' }], LastEvaluatedKey: cursor1 })
        .resolvesOnce({ Items: [{ pk: 'USER#3', sk: 'USER#3' }], LastEvaluatedKey: cursor2 })
        .resolvesOnce({ Items: [{ pk: 'USER#5', sk: 'USER#5' }] });

      const iterator = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.pk, 'USER#'))
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
      const startKey = { pk: 'USER#10', sk: 'USER#10' };

      ddbMock.on(QueryCommand).resolves({ Items: [{ pk: 'USER#11', sk: 'USER#11' }] });

      const iterator = createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.pk, 'USER#'))
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
            { pk: 'USER#1', sk: 'USER#1', name: 'User 1' },
            { pk: 'USER#2', sk: 'USER#2', name: 'User 2' },
          ],
          LastEvaluatedKey: { pk: 'USER#2', sk: 'USER#2' },
        });

      const collected: TestModel[] = [];
      for await (const item of createQueryBuilder<TestModel>(tableName, client, testModel)
        .where((attr, op) => op.beginsWith(attr.pk, 'USER#'))
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
        .where((attr, op) => op.beginsWith(attr.pk, 'NONE#'))
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

describe('QueryBuilder - projection placeholders', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface UserModel {
    pk: string;
    sk: string;
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
      .where((attr, op) => op.eq(attr.pk, 'USER#alice'))
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
    const params = createQueryBuilder<UserModel & { username: string }>(
      tableName,
      client,
      userModel
    )
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
      .where((attr, op) => op.and(op.eq(attr.pk, 'USER#alice'), op.eq(attr.status, 'active')))
      .select(['name', 'status'])
      .dbParams();

    // The map has #status exactly once, mapping to "status".
    expect(params.ExpressionAttributeNames!['#status']).toBe('status');
    expect(params.ProjectionExpression).toBe('#name, #status');
    expect(params.FilterExpression).toMatch(/#status = :status_\d+/);
  });
});
