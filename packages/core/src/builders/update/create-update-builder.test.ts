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

      expect(builder1.dbParams().UpdateExpression).toBeUndefined();
      expect(builder2.dbParams().UpdateExpression).toBe('SET #name = :name_0');
      expect(builder3.dbParams().UpdateExpression).toBe('SET #name = :name_0, #age = :age_1');
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
