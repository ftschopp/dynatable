/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createScanBuilder } from './create-scan-builder';

describe('ScanBuilder', () => {
  const client = new DynamoDBClient({});
  const tableName = 'TestTable';

  interface TestModel {
    pk: string;
    sk: string;
    name?: string;
    age?: number;
    status?: string;
    score?: number;
  }

  describe('Basic scan operations', () => {
    test('should build params for basic scan', () => {
      const params = createScanBuilder<TestModel>(tableName, client).dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.FilterExpression).toBeUndefined();
      expect(params.ProjectionExpression).toBeUndefined();
      expect(params.Limit).toBeUndefined();
    });

    test('should build params with filter', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.eq(attr.status, 'active'))
        .dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.FilterExpression).toMatch(/#status = :status_\d+/);
      expect(params.ExpressionAttributeNames).toEqual({
        '#status': 'status',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('active');
    });

    test('should build params with multiple filters using AND', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.gt(attr.age, 18))
        .filter((attr, op) => op.eq(attr.status, 'active'))
        .dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.FilterExpression).toMatch(/\(#age > :age_\d+\) AND \(#status = :status_\d+\)/);
      expect(params.ExpressionAttributeNames).toEqual({
        '#age': 'age',
        '#status': 'status',
      });
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(18);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('active');
    });

    test('should build params with OR filter', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.or(op.eq(attr.status, 'active'), op.eq(attr.status, 'pending')))
        .dbParams();

      expect(params.FilterExpression).toMatch(
        /\(#status = :status_\d+\) OR \(#status = :status_\d+\)/
      );
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('active');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('pending');
    });
  });

  describe('Projection', () => {
    test('should build params with select', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .select(['name', 'age', 'status'])
        .dbParams();

      expect(params.ProjectionExpression).toBe('name, age, status');
    });

    test('should build params with select and filter', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .select(['name', 'age'])
        .filter((attr, op) => op.gt(attr.age, 18))
        .dbParams();

      expect(params.ProjectionExpression).toBe('name, age');
      expect(params.FilterExpression).toMatch(/#age > :age_\d+/);
    });
  });

  describe('Limit', () => {
    test('should build params with limit', () => {
      const params = createScanBuilder<TestModel>(tableName, client).limit(100).dbParams();

      expect(params.Limit).toBe(100);
    });

    test('should build params with limit and filter', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.eq(attr.status, 'active'))
        .limit(50)
        .dbParams();

      expect(params.Limit).toBe(50);
      expect(params.FilterExpression).toMatch(/#status = :status_\d+/);
    });
  });

  describe('Consistent Read', () => {
    test('should build params with consistent read', () => {
      const params = createScanBuilder<TestModel>(tableName, client).consistentRead().dbParams();

      expect(params.ConsistentRead).toBe(true);
    });

    test('should not set ConsistentRead by default', () => {
      const params = createScanBuilder<TestModel>(tableName, client).dbParams();

      expect(params.ConsistentRead).toBeUndefined();
    });
  });

  describe('Index Scan', () => {
    test('should build params with index name', () => {
      const params = createScanBuilder<TestModel>(tableName, client).usingIndex('GSI1').dbParams();

      expect(params.IndexName).toBe('GSI1');
    });

    test('should build params with index and filter', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .usingIndex('GSI1')
        .filter((attr, op) => op.gt(attr.score, 100))
        .dbParams();

      expect(params.IndexName).toBe('GSI1');
      expect(params.FilterExpression).toMatch(/#score > :score_\d+/);
    });
  });

  describe('Pagination', () => {
    test('should build params with ExclusiveStartKey', () => {
      const startKey = { pk: 'USER#1', sk: 'USER#1' };
      const params = createScanBuilder<TestModel>(tableName, client).startFrom(startKey).dbParams();

      expect(params.ExclusiveStartKey).toEqual(startKey);
    });
  });

  describe('Parallel Scan', () => {
    test('should build params with segment configuration', () => {
      const params = createScanBuilder<TestModel>(tableName, client).segment(0, 4).dbParams();

      expect(params.Segment).toBe(0);
      expect(params.TotalSegments).toBe(4);
    });

    test('should build params with multiple segments', () => {
      const params1 = createScanBuilder<TestModel>(tableName, client).segment(0, 3).dbParams();
      const params2 = createScanBuilder<TestModel>(tableName, client).segment(1, 3).dbParams();
      const params3 = createScanBuilder<TestModel>(tableName, client).segment(2, 3).dbParams();

      expect(params1.Segment).toBe(0);
      expect(params1.TotalSegments).toBe(3);
      expect(params2.Segment).toBe(1);
      expect(params2.TotalSegments).toBe(3);
      expect(params3.Segment).toBe(2);
      expect(params3.TotalSegments).toBe(3);
    });
  });

  describe('Complex scenarios', () => {
    test('should build params with all features', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.and(op.gt(attr.age, 18), op.eq(attr.status, 'active')))
        .select(['name', 'age', 'status'])
        .limit(100)
        .consistentRead()
        .usingIndex('GSI1')
        .dbParams();

      expect(params.TableName).toBe(tableName);
      expect(params.FilterExpression).toMatch(/\(#age > :age_\d+\) AND \(#status = :status_\d+\)/);
      expect(params.ProjectionExpression).toBe('name, age, status');
      expect(params.Limit).toBe(100);
      expect(params.ConsistentRead).toBe(true);
      expect(params.IndexName).toBe('GSI1');
    });

    test('should build params for parallel scan with filter and limit', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.exists(attr.name))
        .limit(50)
        .segment(1, 4)
        .dbParams();

      expect(params.FilterExpression).toMatch(/attribute_exists\(#name\)/);
      expect(params.Limit).toBe(50);
      expect(params.Segment).toBe(1);
      expect(params.TotalSegments).toBe(4);
    });
  });

  describe('Immutability', () => {
    test('should create new builder instance on each method call', () => {
      const builder1 = createScanBuilder<TestModel>(tableName, client);
      const builder2 = builder1.filter((attr, op) => op.eq(attr.status, 'active'));
      const builder3 = builder2.limit(50);

      expect(builder1.dbParams().FilterExpression).toBeUndefined();
      expect(builder1.dbParams().Limit).toBeUndefined();

      expect(builder2.dbParams().FilterExpression).toMatch(/#status = :status_\d+/);
      expect(builder2.dbParams().Limit).toBeUndefined();

      expect(builder3.dbParams().FilterExpression).toMatch(/#status = :status_\d+/);
      expect(builder3.dbParams().Limit).toBe(50);
    });
  });

  describe('Advanced operators', () => {
    test('should support contains operator', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.contains(attr.name, 'John'))
        .dbParams();

      expect(params.FilterExpression).toMatch(/contains\(#name, :name_\d+\)/);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('John');
    });

    test('should support IN operator', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.in(attr.status, ['active', 'pending', 'approved']))
        .dbParams();

      expect(params.FilterExpression).toContain('IN');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('active');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('pending');
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain('approved');
    });

    test('should support size operator', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.size(attr.name).gt(10))
        .dbParams();

      expect(params.FilterExpression).toMatch(/size\(#name\) > :name_size_\d+/);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(10);
    });

    test('should support between operator', () => {
      const params = createScanBuilder<TestModel>(tableName, client)
        .filter((attr, op) => op.between(attr.age, 18, 65))
        .dbParams();

      expect(params.FilterExpression).toMatch(/#age BETWEEN :age_low_\d+ AND :age_high_\d+/);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(18);
      expect(Object.values(params.ExpressionAttributeValues || {})).toContain(65);
    });
  });
});
