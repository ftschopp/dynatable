/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createDeleteBuilder } from './create-delete-builder';

describe('DeleteBuilder', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface TestModel {
    pk: string;
    sk: string;
    name?: string;
    age?: number;
    score?: number;
    followerCount?: number;
    status?: string;
  }

  describe('Basic delete operations', () => {
    test('should build params with just key', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client).dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.Key).toEqual(key);
      expect(params.ConditionExpression).toBeUndefined();
      expect(params.ExpressionAttributeNames).toBeUndefined();
      expect(params.ExpressionAttributeValues).toBeUndefined();
      expect(params.ReturnValues).toBeUndefined();
    });

    test('should build params with partial key', () => {
      const key: Partial<TestModel> = { pk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client).dbParams();

      expect(params.Key).toEqual({ pk: 'USER#1' });
    });
  });

  describe('Condition expressions', () => {
    test('should build params with single where condition', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.eq(attr.status, 'inactive'))
        .dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.Key).toEqual(key);
      expect(params.ConditionExpression).toMatch(/#status = :status_\d+/);
      expect(params.ExpressionAttributeNames).toEqual({
        '#status': 'status',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('inactive');
    });

    test('should build params with AND condition', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.and(op.eq(attr.status, 'inactive'), op.lt(attr.followerCount, 10)))
        .dbParams();

      expect(params.ConditionExpression).toMatch(
        /\(#status = :status_\d+\) AND \(#followerCount < :followerCount_\d+\)/
      );
      expect(params.ExpressionAttributeNames).toEqual({
        '#status': 'status',
        '#followerCount': 'followerCount',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('inactive');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(10);
    });

    test('should build params with OR condition', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.or(op.eq(attr.status, 'inactive'), op.eq(attr.status, 'deleted')))
        .dbParams();

      expect(params.ConditionExpression).toMatch(
        /\(#status = :status_\d+\) OR \(#status = :status_\d+\)/
      );
      expect(params.ExpressionAttributeNames).toEqual({
        '#status': 'status',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('inactive');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('deleted');
    });

    test('should build params with multiple where conditions', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.eq(attr.status, 'inactive'))
        .where((attr, op) => op.lt(attr.followerCount, 10))
        .dbParams();

      expect(params.ConditionExpression).toMatch(
        /\(#status = :status_\d+\) AND \(#followerCount < :followerCount_\d+\)/
      );
      expect(params.ExpressionAttributeNames).toEqual({
        '#status': 'status',
        '#followerCount': 'followerCount',
      });
    });

    test('should build params with complex nested conditions', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) =>
          op.and(
            op.or(op.eq(attr.status, 'inactive'), op.eq(attr.status, 'banned')),
            op.lt(attr.followerCount, 5)
          )
        )
        .dbParams();

      expect(params.ConditionExpression).toMatch(/\(/);
      expect(params.ConditionExpression).toMatch(/AND/);
      expect(params.ConditionExpression).toMatch(/OR/);
      expect(params.ExpressionAttributeNames).toEqual({
        '#status': 'status',
        '#followerCount': 'followerCount',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('inactive');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('banned');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(5);
    });

    test('should support comparison operators', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };

      // Greater than
      const gtParams = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.gt(attr.age, 18))
        .dbParams();
      expect(gtParams.ConditionExpression).toMatch(/#age > :age_\d+/);

      // Greater than or equal
      const gteParams = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.gte(attr.age, 18))
        .dbParams();
      expect(gteParams.ConditionExpression).toMatch(/#age >= :age_\d+/);

      // Less than
      const ltParams = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.lt(attr.age, 65))
        .dbParams();
      expect(ltParams.ConditionExpression).toMatch(/#age < :age_\d+/);

      // Less than or equal
      const lteParams = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.lte(attr.age, 65))
        .dbParams();
      expect(lteParams.ConditionExpression).toMatch(/#age <= :age_\d+/);

      // Not equal
      const neParams = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.ne(attr.status, 'active'))
        .dbParams();
      expect(neParams.ConditionExpression).toMatch(/#status <> :status_\d+/);
    });

    test('should support BETWEEN operator', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.between(attr.age, 18, 65))
        .dbParams();

      expect(params.ConditionExpression).toMatch(/#age BETWEEN :age_low_\d+ AND :age_high_\d+/);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(18);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(65);
    });

    test('should support beginsWith operator', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.beginsWith(attr.name, 'John'))
        .dbParams();

      expect(params.ConditionExpression).toMatch(/begins_with\(#name, :name_\d+\)/);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('John');
    });
  });

  describe('ReturnValues', () => {
    test('should default to NONE', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client).dbParams();

      expect(params.ReturnValues).toBeUndefined();
    });

    test('should support ALL_OLD', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .returning('ALL_OLD')
        .dbParams();

      expect(params.ReturnValues).toBe('ALL_OLD');
    });

    test('should support NONE explicitly', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .returning('NONE')
        .dbParams();

      expect(params.ReturnValues).toBeUndefined();
    });
  });

  describe('Immutability', () => {
    test('should create new builder instance on each method call', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const builder1 = createDeleteBuilder<TestModel>(tableName, key, client);
      const builder2 = builder1.where((attr, op) => op.eq(attr.status, 'inactive'));
      const builder3 = builder2.returning('ALL_OLD');

      expect(builder1.dbParams().ConditionExpression).toBeUndefined();
      expect(builder1.dbParams().ReturnValues).toBeUndefined();

      expect(builder2.dbParams().ConditionExpression).toMatch(/#status = :status_\d+/);
      expect(builder2.dbParams().ReturnValues).toBeUndefined();

      expect(builder3.dbParams().ConditionExpression).toMatch(/#status = :status_\d+/);
      expect(builder3.dbParams().ReturnValues).toBe('ALL_OLD');
    });
  });

  describe('Complex scenarios', () => {
    test('should handle delete with all features', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) =>
          op.and(
            op.eq(attr.status, 'inactive'),
            op.or(op.lt(attr.followerCount, 5), op.gt(attr.age, 365))
          )
        )
        .returning('ALL_OLD')
        .dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.Key).toEqual(key);
      expect(params.ConditionExpression).toBeTruthy();
      expect(params.ConditionExpression).toMatch(/AND/);
      expect(params.ConditionExpression).toMatch(/OR/);
      expect(params.ReturnValues).toBe('ALL_OLD');
      expect(params.ExpressionAttributeNames).toEqual({
        '#status': 'status',
        '#followerCount': 'followerCount',
        '#age': 'age',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('inactive');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(5);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(365);
    });

    test('should handle conditional delete based on multiple attributes', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client)
        .where((attr, op) => op.eq(attr.status, 'inactive'))
        .where((attr, op) => op.lt(attr.followerCount, 10))
        .where((attr, op) => op.between(attr.age, 0, 30))
        .returning('ALL_OLD')
        .dbParams();

      expect(params.ConditionExpression).toBeTruthy();
      expect(params.ConditionExpression).toMatch(/AND/);
      expect(params.ExpressionAttributeNames).toEqual({
        '#status': 'status',
        '#followerCount': 'followerCount',
        '#age': 'age',
      });
    });
  });

  describe('Edge cases', () => {
    test('should handle empty conditions gracefully', () => {
      const key: Partial<TestModel> = { pk: 'USER#1', sk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client).dbParams();

      expect(params.ConditionExpression).toBeUndefined();
      expect(params.ExpressionAttributeNames).toBeUndefined();
      expect(params.ExpressionAttributeValues).toBeUndefined();
    });

    test('should handle key with only pk', () => {
      const key: Partial<TestModel> = { pk: 'USER#1' };
      const params = createDeleteBuilder<TestModel>(tableName, key, client).dbParams();

      expect(params.Key).toEqual({ pk: 'USER#1' });
    });
  });
});
