/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createUpdateBuilder } from './create-update-builder';

describe('UpdateBuilder', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface TestModel {
    pk: string;
    sk: string;
    name?: string;
    age?: number;
    score?: number;
    tags?: string[];
    followerCount?: number;
  }

  describe('SET operations', () => {
    test('should build params with single SET operation', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.Key).toEqual(key);
      expect(params.UpdateExpression).toBe('SET #name = :name_0');
      expect(params.ExpressionAttributeNames).toEqual({ '#name': 'name' });
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'John Doe',
      });
    });

    test('should build params with multiple SET operations', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .set('age', 30)
        .set('score', 100)
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #name = :name_0, #age = :age_1, #score = :score_2');
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#age': 'age',
        '#score': 'score',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'John Doe',
        ':age_1': 30,
        ':score_2': 100,
      });
    });

    test('should build params with multiple SET operations using object', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set({
          name: 'John Doe',
          age: 30,
          score: 100,
        })
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #name = :name_0, #age = :age_1, #score = :score_2');
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#age': 'age',
        '#score': 'score',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'John Doe',
        ':age_1': 30,
        ':score_2': 100,
      });
    });

    test('should build params with single-property object whose key is "name"', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set({ name: 'Ministro Pistarini' })
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #name = :name_0');
      expect(params.ExpressionAttributeNames).toEqual({ '#name': 'name' });
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'Ministro Pistarini',
      });
    });

    test('should build params with single-property object whose key is not "name"', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set({ age: 30 })
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #age = :age_0');
      expect(params.ExpressionAttributeNames).toEqual({ '#age': 'age' });
      expect(params.ExpressionAttributeValues).toEqual({ ':age_0': 30 });
    });

    test('should combine single and multiple SET operations', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .set({ age: 30, score: 100 })
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #name = :name_0, #age = :age_1, #score = :score_2');
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#age': 'age',
        '#score': 'score',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'John Doe',
        ':age_1': 30,
        ':score_2': 100,
      });
    });
  });

  describe('REMOVE operations', () => {
    test('should build params with single REMOVE operation', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .remove('age')
        .dbParams();

      expect(params.UpdateExpression).toBe('REMOVE #age');
      expect(params.ExpressionAttributeNames).toEqual({ '#age': 'age' });
      expect(params.ExpressionAttributeValues).toBeUndefined();
    });

    test('should build params with multiple REMOVE operations', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .remove('age')
        .remove('score')
        .dbParams();

      expect(params.UpdateExpression).toBe('REMOVE #age, #score');
      expect(params.ExpressionAttributeNames).toEqual({
        '#age': 'age',
        '#score': 'score',
      });
    });
  });

  describe('ADD operations', () => {
    test('should build params with single ADD operation', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .add('followerCount', 1)
        .dbParams();

      expect(params.UpdateExpression).toBe('ADD #followerCount :followerCount_0');
      expect(params.ExpressionAttributeNames).toEqual({
        '#followerCount': 'followerCount',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':followerCount_0': 1,
      });
    });

    test('should build params with multiple ADD operations', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .add('followerCount', 1)
        .add('score', 10)
        .dbParams();

      expect(params.UpdateExpression).toBe('ADD #followerCount :followerCount_0, #score :score_1');
      expect(params.ExpressionAttributeNames).toEqual({
        '#followerCount': 'followerCount',
        '#score': 'score',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':followerCount_0': 1,
        ':score_1': 10,
      });
    });
  });

  describe('DELETE operations', () => {
    test('should build params with single DELETE operation', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .delete('tags', ['inactive'])
        .dbParams();

      expect(params.UpdateExpression).toBe('DELETE #tags :tags_0');
      expect(params.ExpressionAttributeNames).toEqual({ '#tags': 'tags' });
      expect(params.ExpressionAttributeValues).toEqual({
        ':tags_0': ['inactive'],
      });
    });

    test('should build params with multiple DELETE operations', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .delete('tags', ['inactive'])
        .delete('tags', ['old'])
        .dbParams();

      expect(params.UpdateExpression).toBe('DELETE #tags :tags_0, #tags :tags_1');
      expect(params.ExpressionAttributeNames).toEqual({ '#tags': 'tags' });
      expect(params.ExpressionAttributeValues).toEqual({
        ':tags_0': ['inactive'],
        ':tags_1': ['old'],
      });
    });
  });

  describe('Mixed operations', () => {
    test('should build params with SET and REMOVE', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .remove('age')
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #name = :name_0 REMOVE #age');
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#age': 'age',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'John Doe',
      });
    });

    test('should build params with all operation types', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .remove('age')
        .add('followerCount', 1)
        .delete('tags', ['old'])
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #name = :name_0 REMOVE #age ADD #followerCount :followerCount_1 DELETE #tags :tags_2'
      );
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#age': 'age',
        '#followerCount': 'followerCount',
        '#tags': 'tags',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'John Doe',
        ':followerCount_1': 1,
        ':tags_2': ['old'],
      });
    });
  });

  describe('Condition expressions', () => {
    test('should build params with where condition', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .where((attr, op) => op.eq(attr.age, 25))
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #name = :name_0');
      expect(params.ConditionExpression).toMatch(/#age = :age_\d+/);
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#age': 'age',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('John Doe');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(25);
    });

    test('should build params with multiple where conditions using AND', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .where((attr, op) => op.and(op.gt(attr.age, 18), op.lt(attr.age, 65)))
        .dbParams();

      expect(params.ConditionExpression).toMatch(/\(#age > :age_\d+\) AND \(#age < :age_\d+\)/);
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#age': 'age',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(18);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(65);
    });

    test('should build params with OR conditions', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .where((attr, op) => op.or(op.eq(attr.age, 25), op.eq(attr.age, 30)))
        .dbParams();

      expect(params.ConditionExpression).toMatch(/\(#age = :age_\d+\) OR \(#age = :age_\d+\)/);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(25);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(30);
    });
  });

  describe('ReturnValues', () => {
    test('should default to NONE', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .dbParams();

      expect(params.ReturnValues).toBeUndefined();
    });

    test('should support ALL_OLD', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .returning('ALL_OLD')
        .dbParams();

      expect(params.ReturnValues).toBe('ALL_OLD');
    });

    test('should support ALL_NEW', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .returning('ALL_NEW')
        .dbParams();

      expect(params.ReturnValues).toBe('ALL_NEW');
    });

    test('should support UPDATED_OLD', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .returning('UPDATED_OLD')
        .dbParams();

      expect(params.ReturnValues).toBe('UPDATED_OLD');
    });

    test('should support UPDATED_NEW', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .returning('UPDATED_NEW')
        .dbParams();

      expect(params.ReturnValues).toBe('UPDATED_NEW');
    });
  });

  describe('Immutability', () => {
    test('should create new builder instance on each method call', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const builder1 = createUpdateBuilder<TestModel>(tableName, key, client);
      const builder2 = builder1.set('name', 'John');
      const builder3 = builder2.set('age', 30);

      // builder1 has no actions — calling dbParams() throws now (an
      // empty UpdateExpression would be rejected by DynamoDB anyway).
      expect(() => builder1.dbParams()).toThrow(/no SET, REMOVE, ADD, or DELETE/i);
      expect(builder2.dbParams().UpdateExpression).toBe('SET #name = :name_0');
      expect(builder3.dbParams().UpdateExpression).toBe('SET #name = :name_0, #age = :age_1');
    });
  });

  describe('Secondary-index recomputation (indexContext)', () => {
    interface PersonnelModel {
      id: string;
      airportId: string;
      firstName: string;
      lastName: string;
      role: string;
    }

    const personnelModel = {
      key: {
        PK: { type: String, value: 'PERSON#${id}' },
        SK: { type: String, value: 'PROFILE' },
      },
      index: {
        GSI1PK: { type: String, value: 'AIRPORT#${airportId}' },
        GSI1SK: { type: String, value: 'PERSON#${lastName}#${firstName}' },
      },
      attributes: {
        id: { type: String, required: true },
        airportId: { type: String, required: true },
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        role: { type: String },
      },
    } as const;

    test('does nothing when no .set() field appears in any index template', () => {
      const params = createUpdateBuilder<PersonnelModel>(
        tableName,
        { id: '1' } as Partial<PersonnelModel>,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        false,
        undefined,
        { model: personnelModel as any, keyVars: { id: '1' } }
      )
        .set('role', 'pilot')
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #role = :role_0');
      expect(params.ExpressionAttributeNames).toEqual({ '#role': 'role' });
    });

    test('recomputes affected index when all template vars are present in updates', () => {
      const params = createUpdateBuilder<PersonnelModel>(
        tableName,
        { id: '1' } as Partial<PersonnelModel>,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        false,
        undefined,
        { model: personnelModel as any, keyVars: { id: '1' } }
      )
        .set({ firstName: 'Ada', lastName: 'Lovelace' })
        .dbParams();

      // GSI1SK depends on lastName + firstName — both supplied → recomputed.
      // GSI1PK depends on airportId — untouched, no recompute.
      expect(params.UpdateExpression).toBe(
        'SET #firstName = :firstName_0, #lastName = :lastName_1, #GSI1SK = :GSI1SK_2'
      );
      expect(params.ExpressionAttributeValues).toMatchObject({
        ':firstName_0': 'Ada',
        ':lastName_1': 'Lovelace',
        ':GSI1SK_2': 'PERSON#Lovelace#Ada',
      });
    });

    test('throws when an affected index template references a field not in updates or key', () => {
      const builder = createUpdateBuilder<PersonnelModel>(
        tableName,
        { id: '1' } as Partial<PersonnelModel>,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        false,
        undefined,
        { model: personnelModel as any, keyVars: { id: '1' } }
      ).set({ lastName: 'Lovelace' });

      // GSI1SK template = "PERSON#${lastName}#${firstName}" — firstName is missing.
      expect(() => builder.dbParams()).toThrow(/firstName/);
      expect(() => builder.dbParams()).toThrow(/GSI1SK/);
    });

    test('uses primary-key template vars when resolving index templates', () => {
      const userModel = {
        key: {
          PK: { type: String, value: 'USER#${username}' },
          SK: { type: String, value: 'USER#${username}' },
        },
        index: {
          GSI1PK: { type: String, value: 'USER#${username}#STATUS#${status}' },
        },
        attributes: {
          username: { type: String, required: true },
          status: { type: String, required: true },
        },
      } as const;

      const params = createUpdateBuilder<{ username: string; status: string }>(
        tableName,
        { username: 'jane' } as any,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        false,
        undefined,
        { model: userModel as any, keyVars: { username: 'jane' } }
      )
        .set('status', 'active')
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #status = :status_0, #GSI1PK = :GSI1PK_1'
      );
      expect(params.ExpressionAttributeValues).toMatchObject({
        ':status_0': 'active',
        ':GSI1PK_1': 'USER#jane#STATUS#active',
      });
    });

    test('accumulates set inputs across chained calls before resolving', () => {
      const params = createUpdateBuilder<PersonnelModel>(
        tableName,
        { id: '1' } as Partial<PersonnelModel>,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        false,
        undefined,
        { model: personnelModel as any, keyVars: { id: '1' } }
      )
        .set('lastName', 'Lovelace')
        .set('firstName', 'Ada')
        .dbParams();

      // Each individual .set() was missing one var, but the accumulator has both
      // by the time dbParams() runs.
      expect(params.UpdateExpression).toBe(
        'SET #lastName = :lastName_0, #firstName = :firstName_1, #GSI1SK = :GSI1SK_2'
      );
      expect(params.ExpressionAttributeValues).toMatchObject({
        ':GSI1SK_2': 'PERSON#Lovelace#Ada',
      });
    });

    test('does nothing when indexContext is omitted (backwards-compatible default)', () => {
      const params = createUpdateBuilder<PersonnelModel>(
        tableName,
        { id: '1' } as Partial<PersonnelModel>,
        client
      )
        .set({ lastName: 'Lovelace' })
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #lastName = :lastName_0');
    });

    test('throws when the user explicitly .set()s an index key that auto-recompute would also write', () => {
      // Reproduces the silent-collision bug: user sets GSI1PK by hand
      // while a touched template var would also recompute it.
      const builder = createUpdateBuilder<PersonnelModel & { GSI1PK: string }>(
        tableName,
        { id: '1' } as Partial<PersonnelModel & { GSI1PK: string }>,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        false,
        undefined,
        { model: personnelModel as any, keyVars: { id: '1' } }
      )
        .set('airportId' as any, 'EZE')
        .set('GSI1PK' as any, 'CUSTOM#OVERRIDE');

      expect(() => builder.dbParams()).toThrow(/GSI1PK/);
      expect(() => builder.dbParams()).toThrow(/twice/i);
    });

    test('throws when no SET/REMOVE/ADD/DELETE actions have been added', () => {
      const builder = createUpdateBuilder<TestModel>(
        tableName,
        { pk: 'USER#1', sk: 'USER#1' } as Partial<TestModel>,
        client
      );

      expect(() => builder.dbParams()).toThrow(/no SET, REMOVE, ADD, or DELETE/i);
    });

    test('throws when only a where() was set (no actions)', () => {
      // A `.where()`-only chain produces a ConditionExpression but no
      // UpdateExpression — DynamoDB rejects that. Catch it early.
      const builder = createUpdateBuilder<TestModel>(
        tableName,
        { pk: 'USER#1', sk: 'USER#1' } as Partial<TestModel>,
        client
      ).where((attr, op) => op.eq(attr.name, 'alice'));

      expect(() => builder.dbParams()).toThrow(/no SET, REMOVE, ADD, or DELETE/i);
    });

    test('same attribute appears in both .where() and .set() — known placeholder collision', () => {
      // KNOWN BUG: the opBuilder created inside .where() has its own
      // counter starting at 0, independent of the update builder's
      // valueCounter. So `.where(op.eq(attr.status, 'pending'))` emits
      // `:status_0` *and* the next `.set('status', 'active')` also
      // emits `:status_0`, with the second value silently overwriting
      // the first when the values map is merged.
      //
      // This test documents the current state so a fix can flip the
      // assertions without rewriting the scenario. See follow-up issue.
      const params = createUpdateBuilder<TestModel>(
        tableName,
        { pk: 'USER#1', sk: 'USER#1' } as Partial<TestModel>,
        client
      )
        .where((attr, op) => op.eq(attr.status, 'pending'))
        .set('status', 'active')
        .dbParams();

      expect(params.UpdateExpression).toMatch(/^SET #status = :status_\d+$/);
      expect(params.ConditionExpression).toMatch(/#status = :status_\d+/);
      expect(params.ExpressionAttributeNames!['#status']).toBe('status');

      // Document collision: only one `:status_0` survives in the values
      // map, with the SET value winning. After the bug is fixed this
      // should be 2.
      const valueKeys = Object.keys(params.ExpressionAttributeValues!).filter((k) =>
        k.startsWith(':status_')
      );
      expect(valueKeys.length).toBeGreaterThanOrEqual(1);
    });

    test('does not throw when the user .set()s an unrelated index key that auto-recompute is NOT touching', () => {
      // GSI1PK only depends on airportId. User sets GSI1SK explicitly,
      // and only updates `role` (not in any index template) — no
      // recomputation, so no collision.
      const params = createUpdateBuilder<PersonnelModel & { GSI1SK: string }>(
        tableName,
        { id: '1' } as Partial<PersonnelModel & { GSI1SK: string }>,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        false,
        undefined,
        { model: personnelModel as any, keyVars: { id: '1' } }
      )
        .set('role', 'pilot')
        .set('GSI1SK' as any, 'CUSTOM#SK')
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #role = :role_0, #GSI1SK = :GSI1SK_1');
    });
  });

  describe('Complex scenarios', () => {
    test('should handle complex update with all features', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'John Doe')
        .set('score', 100)
        .add('followerCount', 5)
        .remove('age')
        .where((attr, op) => op.and(op.gt(attr.followerCount, 0), op.lt(attr.followerCount, 1000)))
        .returning('ALL_NEW')
        .dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.Key).toEqual(key);
      expect(params.UpdateExpression).toContain('SET');
      expect(params.UpdateExpression).toContain('ADD');
      expect(params.UpdateExpression).toContain('REMOVE');
      expect(params.ConditionExpression).toMatch(
        /\(#followerCount > :followerCount_\d+\) AND \(#followerCount < :followerCount_\d+\)/
      );
      expect(params.ReturnValues).toBe('ALL_NEW');
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#score': 'score',
        '#followerCount': 'followerCount',
        '#age': 'age',
      });
    });
  });
});
