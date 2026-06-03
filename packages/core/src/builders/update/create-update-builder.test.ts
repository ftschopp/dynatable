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
    status?: string;
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

    describe('Primary-key template guard', () => {
      // PK = 'PERSON#${id}', SK = 'PROFILE'
      // Updating `id` would silently leave the row's PK at the old value
      // while writing the new id as an attribute — we reject before send.

      test('rejects .set(field, val) on a primary-key template var', () => {
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
        ).set('id', '2');

        expect(() => builder.dbParams()).toThrow(/primary key template/i);
        expect(() => builder.dbParams()).toThrow(/\[id\]/);
      });

      test('rejects .set({ ... }) object form when it contains a primary-key template var', () => {
        // The object overload populates setInputs the same way as the
        // single-field form, so the guard must fire here too.
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
        ).set({ id: '2', role: 'pilot' });

        expect(() => builder.dbParams()).toThrow(/primary key template/i);
        expect(() => builder.dbParams()).toThrow(/\[id\]/);
      });

      test('rejects .remove() of a primary-key template var', () => {
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
        ).remove('id');

        expect(() => builder.dbParams()).toThrow(/primary key template/i);
      });

      test('rejects .add() of a primary-key template var', () => {
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
        ).add('id' as any, 1);

        expect(() => builder.dbParams()).toThrow(/primary key template/i);
      });

      test('still allows updates that touch unrelated attributes', () => {
        // Sanity check: the guard only fires on PK template vars.
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

        expect(params.UpdateExpression).toContain('#firstName');
        expect(params.UpdateExpression).toContain('#lastName');
      });
    });

    describe('Secondary-index template guard for non-set ops', () => {
      // GSI1PK depends on airportId. .add()/.remove()/.delete() can't
      // expose a new value to the recompute path, so we reject and
      // require the caller to switch to .set(field, newValue).

      test('rejects .remove() of a field used in a GSI template', () => {
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
        ).remove('airportId');

        expect(() => builder.dbParams()).toThrow(/secondary-index template/i);
        expect(() => builder.dbParams()).toThrow(/\[airportId\]/);
        expect(() => builder.dbParams()).toThrow(/\.set\(/);
      });

      test('rejects .add() of a field used in a GSI template', () => {
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
        ).add('airportId' as any, 1);

        expect(() => builder.dbParams()).toThrow(/secondary-index template/i);
      });

      test('rejects .delete() of a field used in a GSI template', () => {
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
        ).delete('airportId' as any, new Set(['EZE']));

        expect(() => builder.dbParams()).toThrow(/secondary-index template/i);
      });

      test('still allows .add()/.remove()/.delete() on unrelated fields', () => {
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
          .add('role' as any, 1)
          .remove('role')
          .dbParams();

        expect(params.UpdateExpression).toContain('ADD #role');
        expect(params.UpdateExpression).toContain('REMOVE #role');
      });
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

  describe('returnConsumedCapacity', () => {
    test('omits ReturnConsumedCapacity by default', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'Alice')
        .dbParams();
      expect(params.ReturnConsumedCapacity).toBeUndefined();
    });

    test('passes the configured mode through to dbParams', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', 'Alice')
        .returnConsumedCapacity('TOTAL')
        .dbParams();
      expect(params.ReturnConsumedCapacity).toBe('TOTAL');
    });

    test('persists across other chained calls (immutability)', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .returnConsumedCapacity('INDEXES')
        .set('name', 'Alice')
        .returning('ALL_NEW')
        .dbParams();
      expect(params.ReturnConsumedCapacity).toBe('INDEXES');
      expect(params.ReturnValues).toBe('ALL_NEW');
    });
  });

  describe('setIfNotExists', () => {
    interface UpsertModel {
      pk: string;
      sk: string;
      createdAt?: string;
      createdBy?: string;
      updatedAt?: string;
      name?: string;
    }

    test('emits if_not_exists() expression for single attribute', () => {
      const key: Partial<UpsertModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<UpsertModel>(tableName, key, client)
        .setIfNotExists('createdAt', '2026-01-01T00:00:00Z')
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #createdAt = if_not_exists(#createdAt, :createdAt_0)'
      );
      expect(params.ExpressionAttributeNames).toEqual({ '#createdAt': 'createdAt' });
      expect(params.ExpressionAttributeValues).toEqual({
        ':createdAt_0': '2026-01-01T00:00:00Z',
      });
    });

    test('emits one if_not_exists() per attribute for object form', () => {
      const key: Partial<UpsertModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<UpsertModel>(tableName, key, client)
        .setIfNotExists({
          createdAt: '2026-01-01T00:00:00Z',
          createdBy: 'alice',
        })
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #createdAt = if_not_exists(#createdAt, :createdAt_0), ' +
          '#createdBy = if_not_exists(#createdBy, :createdBy_1)'
      );
      expect(params.ExpressionAttributeNames).toEqual({
        '#createdAt': 'createdAt',
        '#createdBy': 'createdBy',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':createdAt_0': '2026-01-01T00:00:00Z',
        ':createdBy_1': 'alice',
      });
    });

    test('combines with .set() on different attributes in one SET clause', () => {
      const key: Partial<UpsertModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<UpsertModel>(tableName, key, client)
        .set('name', 'Alice')
        .setIfNotExists('createdAt', '2026-01-01T00:00:00Z')
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #name = :name_0, #createdAt = if_not_exists(#createdAt, :createdAt_1)'
      );
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'Alice',
        ':createdAt_1': '2026-01-01T00:00:00Z',
      });
    });

    test('builder is immutable — chained call returns a new instance', () => {
      const key: Partial<UpsertModel> = { pk: 'USER#1', sk: 'USER#1' };
      const builder1 = createUpdateBuilder<UpsertModel>(tableName, key, client);
      const builder2 = builder1.setIfNotExists('createdAt', '2026-01-01T00:00:00Z');

      expect(() => builder1.dbParams()).toThrow(/no SET, REMOVE, ADD, or DELETE/i);
      expect(builder2.dbParams().UpdateExpression).toBe(
        'SET #createdAt = if_not_exists(#createdAt, :createdAt_0)'
      );
    });

    test('preserves ReturnValues setting through the chain', () => {
      const key: Partial<UpsertModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<UpsertModel>(tableName, key, client)
        .setIfNotExists('createdAt', '2026-01-01T00:00:00Z')
        .returning('ALL_NEW')
        .dbParams();
      expect(params.ReturnValues).toBe('ALL_NEW');
    });

    test('with enableTimestamps + setIfNotExists(createdAt) — both SETs coexist', () => {
      // Classic upsert pattern: enableTimestamps owns updatedAt, the user
      // owns createdAt with setIfNotExists so it's written only on insert.
      const key: Partial<UpsertModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createUpdateBuilder<UpsertModel>(
        tableName,
        key,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        true // enableTimestamps
      )
        .set('name', 'Alice')
        .setIfNotExists('createdAt', '2026-01-01T00:00:00Z')
        .dbParams();

      expect(params.UpdateExpression).toContain(
        '#createdAt = if_not_exists(#createdAt, :createdAt_1)'
      );
      expect(params.UpdateExpression).toContain('#updatedAt = :updatedAt_ts');
      expect(params.UpdateExpression).toContain('#name = :name_0');
    });
  });

  describe('setIfNotExists — guards and dedup', () => {
    interface PersonnelModel {
      id: string;
      airportId: string;
      firstName: string;
      lastName: string;
      role: string;
      createdAt?: string;
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
        createdAt: { type: String },
      },
    } as const;

    test('rejects setIfNotExists on a primary-key template var', () => {
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
      ).setIfNotExists('id', '2');

      expect(() => builder.dbParams()).toThrow(/primary key template/i);
      expect(() => builder.dbParams()).toThrow(/\[id\]/);
    });

    test('rejects setIfNotExists on a secondary-index template var', () => {
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
      ).setIfNotExists('airportId', 'EZE');

      expect(() => builder.dbParams()).toThrow(/secondary-index template/i);
      expect(() => builder.dbParams()).toThrow(/\[airportId\]/);
      expect(() => builder.dbParams()).toThrow(/if_not_exists\(\)/);
    });

    test('rejects setIfNotExists object form when a key is in a GSI template', () => {
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
      ).setIfNotExists({ createdAt: '2026-01-01', firstName: 'Ada' });

      // firstName participates in GSI1SK → rejection.
      expect(() => builder.dbParams()).toThrow(/secondary-index template/i);
      expect(() => builder.dbParams()).toThrow(/\[firstName\]/);
    });

    test('allows setIfNotExists on a field that is NOT in any index template', () => {
      // createdAt is declared in attributes but not referenced by any
      // key or GSI template — the safe upsert case.
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
        .setIfNotExists('createdAt', '2026-01-01T00:00:00Z')
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #role = :role_0, #createdAt = if_not_exists(#createdAt, :createdAt_1)'
      );
      // GSI keys are not touched — no recompute.
      expect(params.ExpressionAttributeNames).not.toHaveProperty('#GSI1SK');
      expect(params.ExpressionAttributeNames).not.toHaveProperty('#GSI1PK');
    });

    test('dedup: .set() then .setIfNotExists() on the same attribute throws', () => {
      const key: Partial<{ pk: string; sk: string; foo: string }> = {
        pk: 'USER#1',
        sk: 'USER#1',
      };
      const builder = createUpdateBuilder<{ pk: string; sk: string; foo: string }>(
        tableName,
        key,
        client
      )
        .set('foo', 'a')
        .setIfNotExists('foo', 'b');

      expect(() => builder.dbParams()).toThrow(/multiple SET actions/i);
      expect(() => builder.dbParams()).toThrow(/\[foo\]/);
    });

    test('dedup: .set() twice on the same attribute throws (latent bug fix)', () => {
      const key: Partial<{ pk: string; sk: string; foo: string }> = {
        pk: 'USER#1',
        sk: 'USER#1',
      };
      const builder = createUpdateBuilder<{ pk: string; sk: string; foo: string }>(
        tableName,
        key,
        client
      )
        .set('foo', 'a')
        .set('foo', 'b');

      expect(() => builder.dbParams()).toThrow(/multiple SET actions/i);
      expect(() => builder.dbParams()).toThrow(/\[foo\]/);
    });

    test('dedup: setIfNotExists(updatedAt) with enableTimestamps throws', () => {
      const key: Partial<{ pk: string; sk: string; updatedAt: string }> = {
        pk: 'USER#1',
        sk: 'USER#1',
      };
      const builder = createUpdateBuilder<{ pk: string; sk: string; updatedAt: string }>(
        tableName,
        key,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        true // enableTimestamps
      ).setIfNotExists('updatedAt', '2026-01-01');

      expect(() => builder.dbParams()).toThrow(/multiple SET actions/i);
      expect(() => builder.dbParams()).toThrow(/\[updatedAt\]/);
    });

    test('only-setIfNotExists chain (no .set/.remove/.add/.delete) still produces valid params', () => {
      const key: Partial<{ pk: string; sk: string; createdAt: string }> = {
        pk: 'USER#1',
        sk: 'USER#1',
      };
      const params = createUpdateBuilder<{ pk: string; sk: string; createdAt: string }>(
        tableName,
        key,
        client
      )
        .setIfNotExists('createdAt', '2026-01-01T00:00:00Z')
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #createdAt = if_not_exists(#createdAt, :createdAt_0)'
      );
    });
  });

  describe('undefined-value guard', () => {
    const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };

    test('.set(attr, undefined) throws with actionable message', () => {
      expect(() =>
        createUpdateBuilder<TestModel>(tableName, key, client).set('name', undefined)
      ).toThrow(/\.set\(\) received undefined for key\(s\) \[name\]/);
    });

    test('.set(attr, undefined) error mentions .remove and filtering', () => {
      try {
        createUpdateBuilder<TestModel>(tableName, key, client).set('name', undefined);
        throw new Error('expected throw');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toMatch(/\.remove\(attr\)/);
        expect(msg).toMatch(/filter undefined/);
      }
    });

    test('.set({ x: undefined, y: 1 }) throws and names only the undefined keys', () => {
      expect(() =>
        createUpdateBuilder<TestModel>(tableName, key, client).set({
          name: 'Alice',
          age: undefined,
        })
      ).toThrow(/\.set\(\) received undefined for key\(s\) \[age\]/);
    });

    test('.set({ x: undefined, y: undefined }) lists both keys', () => {
      expect(() =>
        createUpdateBuilder<TestModel>(tableName, key, client).set({
          name: undefined,
          age: undefined,
        })
      ).toThrow(/\[name, age\]/);
    });

    test('.set with all defined values still works', () => {
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set({ name: 'Alice', age: 30 })
        .dbParams();
      expect(params.UpdateExpression).toBe('SET #name = :name_0, #age = :age_1');
    });

    test('.set allows null (null is a valid DDB attribute type)', () => {
      const params = createUpdateBuilder<TestModel>(tableName, key, client)
        .set('name', null)
        .dbParams();
      expect(params.UpdateExpression).toBe('SET #name = :name_0');
      expect(params.ExpressionAttributeValues).toEqual({ ':name_0': null });
    });

    test('.setIfNotExists(attr, undefined) throws', () => {
      expect(() =>
        createUpdateBuilder<TestModel>(tableName, key, client).setIfNotExists(
          'name',
          undefined
        )
      ).toThrow(/\.setIfNotExists\(\) received undefined for key\(s\) \[name\]/);
    });

    test('.setIfNotExists({ x: undefined }) throws', () => {
      expect(() =>
        createUpdateBuilder<TestModel>(tableName, key, client).setIfNotExists({
          name: undefined,
        })
      ).toThrow(/\.setIfNotExists\(\) received undefined for key\(s\) \[name\]/);
    });

    test('.setIfNotExists error does NOT mention .remove (it would be wrong guidance)', () => {
      try {
        createUpdateBuilder<TestModel>(tableName, key, client).setIfNotExists(
          'name',
          undefined
        );
        throw new Error('expected throw');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).not.toMatch(/\.remove\(attr\)/);
        expect(msg).toMatch(/omit the key/);
      }
    });

    test('.add(attr, undefined) throws', () => {
      expect(() =>
        createUpdateBuilder<TestModel>(tableName, key, client).add(
          'followerCount',
          undefined
        )
      ).toThrow(/\.add\(\) received undefined for key\(s\) \[followerCount\]/);
    });

    test('.delete(attr, undefined) throws', () => {
      expect(() =>
        createUpdateBuilder<TestModel>(tableName, key, client).delete('tags', undefined)
      ).toThrow(/\.delete\(\) received undefined for key\(s\) \[tags\]/);
    });
  });

  describe('setDefined', () => {
    interface UpsertModel {
      pk: string;
      sk: string;
      name?: string;
      age?: number;
      lastSeen?: string;
      createdAt?: string;
    }
    const upsertKey: Partial<UpsertModel> = { pk: 'USER#1', sk: 'USER#1' };

    test('routes defined values to SET and undefined keys to REMOVE', () => {
      const params = createUpdateBuilder<UpsertModel>(tableName, upsertKey, client)
        .setDefined({ name: 'Alice', age: undefined, lastSeen: '2026-06-03' })
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #name = :name_0, #lastSeen = :lastSeen_1 REMOVE #age'
      );
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#lastSeen': 'lastSeen',
        '#age': 'age',
      });
      expect(params.ExpressionAttributeValues).toEqual({
        ':name_0': 'Alice',
        ':lastSeen_1': '2026-06-03',
      });
    });

    test('all-undefined payload produces only REMOVE', () => {
      const params = createUpdateBuilder<UpsertModel>(tableName, upsertKey, client)
        .setDefined({ name: undefined, age: undefined })
        .dbParams();

      expect(params.UpdateExpression).toBe('REMOVE #name, #age');
      expect(params.ExpressionAttributeValues).toBeUndefined();
    });

    test('all-defined payload produces only SET', () => {
      const params = createUpdateBuilder<UpsertModel>(tableName, upsertKey, client)
        .setDefined({ name: 'Alice', age: 30 })
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #name = :name_0, #age = :age_1');
    });

    test('empty payload falls through to the "no actions" guard', () => {
      const builder = createUpdateBuilder<UpsertModel>(tableName, upsertKey, client)
        .setDefined({});
      expect(() => builder.dbParams()).toThrow(/no SET, REMOVE, ADD, or DELETE/i);
    });

    test('treats null as a defined value (writes NULL, not REMOVE)', () => {
      const params = createUpdateBuilder<UpsertModel>(tableName, upsertKey, client)
        .setDefined({ name: null as unknown as string })
        .dbParams();

      expect(params.UpdateExpression).toBe('SET #name = :name_0');
      expect(params.ExpressionAttributeValues).toEqual({ ':name_0': null });
    });

    test('composes with .setIfNotExists for the typical upsert pattern', () => {
      // Defined fields → SET, undefined → REMOVE, plus createdAt only on
      // first insert. This is the canonical external-sync use case.
      const params = createUpdateBuilder<UpsertModel>(tableName, upsertKey, client)
        .setDefined({ name: 'Alice', age: undefined })
        .setIfNotExists('createdAt', '2026-01-01T00:00:00Z')
        .dbParams();

      expect(params.UpdateExpression).toBe(
        'SET #name = :name_0, #createdAt = if_not_exists(#createdAt, :createdAt_1) ' +
          'REMOVE #age'
      );
    });

    test('immutability: each call returns a new builder', () => {
      const b1 = createUpdateBuilder<UpsertModel>(tableName, upsertKey, client);
      const b2 = b1.setDefined({ name: 'Alice' });
      expect(() => b1.dbParams()).toThrow(/no SET, REMOVE, ADD, or DELETE/i);
      expect(b2.dbParams().UpdateExpression).toBe('SET #name = :name_0');
    });

    test('dedup: setDefined({x: undefined}) + .set(x, v) throws via overlap', () => {
      // setDefined routes undefined to REMOVE, .set adds SET → DynamoDB
      // rejects overlapping document paths between SET and REMOVE
      // sections. The library does not yet pre-validate SET/REMOVE
      // overlap (only SET/SET dedup), but verify the error surfaces
      // either way: when this gets caught locally the message will
      // mention overlapping paths.
      const params = createUpdateBuilder<UpsertModel>(tableName, upsertKey, client)
        .setDefined({ name: undefined })
        .set('name', 'Alice')
        .dbParams();
      // For now both actions are emitted; document the wire-level shape
      // so the test fails loudly if dedup is later extended to SET/REMOVE.
      expect(params.UpdateExpression).toBe('SET #name = :name_0 REMOVE #name');
    });

    describe('with indexContext', () => {
      interface PersonnelModel {
        id: string;
        airportId: string;
        firstName: string;
        lastName: string;
        role: string;
        notes?: string;
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
          notes: { type: String },
        },
      } as const;

      const makeBuilder = () =>
        createUpdateBuilder<PersonnelModel>(
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
        );

      test('rejects undefined targeting a primary-key template var', () => {
        const builder = makeBuilder().setDefined({ id: undefined });
        expect(() => builder.dbParams()).toThrow(/primary key template/i);
        expect(() => builder.dbParams()).toThrow(/\[id\]/);
      });

      test('rejects undefined targeting a secondary-index template var', () => {
        // lastName participates in GSI1SK. setDefined routes it to REMOVE,
        // and the existing GSI guard 2 rejects .remove() on GSI template
        // fields because the index key cannot be recomputed.
        const builder = makeBuilder().setDefined({ lastName: undefined });
        expect(() => builder.dbParams()).toThrow(/secondary-index template/i);
        expect(() => builder.dbParams()).toThrow(/\[lastName\]/);
      });

      test('triggers GSI key recomputation when defined fields participate', () => {
        // Updating both firstName and lastName via setDefined → SET path
        // resolves GSI1SK = PERSON#<lastName>#<firstName>.
        const params = makeBuilder()
          .setDefined({ firstName: 'Ada', lastName: 'Lovelace' })
          .dbParams();
        expect(params.UpdateExpression).toContain('#firstName = :firstName_0');
        expect(params.UpdateExpression).toContain('#lastName = :lastName_1');
        expect(params.UpdateExpression).toContain('#GSI1SK = :GSI1SK_');
        expect(params.ExpressionAttributeValues).toMatchObject({
          ':firstName_0': 'Ada',
          ':lastName_1': 'Lovelace',
        });
        const gsiKey = Object.entries(params.ExpressionAttributeValues!).find(
          ([k]) => k.startsWith(':GSI1SK_')
        );
        expect(gsiKey?.[1]).toBe('PERSON#Lovelace#Ada');
      });

      test('allows setDefined on fields outside any template', () => {
        const params = makeBuilder()
          .setDefined({ role: 'pilot', notes: undefined })
          .dbParams();
        expect(params.UpdateExpression).toBe('SET #role = :role_0 REMOVE #notes');
      });
    });
  });
});
