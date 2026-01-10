/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { createGetBuilder } from './create-get-builder';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBClient);

type TestUser = {
  username: string;
  email: string;
  name: string;
  status: string;
  age: number;
};

describe('GetBuilder', () => {
  let client: DynamoDBClient;

  beforeEach(() => {
    ddbMock.reset();
    client = new DynamoDBClient({});
  });

  describe('ProjectionExpression with ExpressionAttributeNames', () => {
    it('should use ExpressionAttributeNames for simple attributes', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder.select(['username', 'email']).dbParams();

      expect(params.ProjectionExpression).toBe('#username, #email');
      expect(params.ExpressionAttributeNames).toEqual({
        '#username': 'username',
        '#email': 'email',
      });
    });

    it('should handle reserved words correctly', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      // 'name' and 'status' are DynamoDB reserved words
      const params = builder.select(['name', 'status']).dbParams();

      expect(params.ProjectionExpression).toBe('#name, #status');
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#status': 'status',
      });
    });

    it('should work with mixed reserved and non-reserved words', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder.select(['username', 'name', 'status', 'email']).dbParams();

      expect(params.ProjectionExpression).toBe('#username, #name, #status, #email');
      expect(params.ExpressionAttributeNames).toEqual({
        '#username': 'username',
        '#name': 'name',
        '#status': 'status',
        '#email': 'email',
      });
    });

    it('should not add ExpressionAttributeNames when no projection', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder.dbParams();

      expect(params.ProjectionExpression).toBeUndefined();
      expect(params.ExpressionAttributeNames).toBeUndefined();
    });
  });

  describe('returnConsumedCapacity()', () => {
    it('should add ReturnConsumedCapacity with TOTAL', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder.returnConsumedCapacity('TOTAL').dbParams();

      expect(params.ReturnConsumedCapacity).toBe('TOTAL');
    });

    it('should add ReturnConsumedCapacity with INDEXES', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder.returnConsumedCapacity('INDEXES').dbParams();

      expect(params.ReturnConsumedCapacity).toBe('INDEXES');
    });

    it('should add ReturnConsumedCapacity with NONE', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder.returnConsumedCapacity('NONE').dbParams();

      expect(params.ReturnConsumedCapacity).toBe('NONE');
    });

    it('should not add ReturnConsumedCapacity when not specified', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder.dbParams();

      expect(params.ReturnConsumedCapacity).toBeUndefined();
    });
  });

  describe('Method chaining with immutability', () => {
    it('should chain select() and returnConsumedCapacity()', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder
        .select(['username', 'email'])
        .returnConsumedCapacity('TOTAL')
        .dbParams();

      expect(params.ProjectionExpression).toBe('#username, #email');
      expect(params.ExpressionAttributeNames).toEqual({
        '#username': 'username',
        '#email': 'email',
      });
      expect(params.ReturnConsumedCapacity).toBe('TOTAL');
    });

    it('should chain consistentRead() and returnConsumedCapacity()', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder.consistentRead().returnConsumedCapacity('INDEXES').dbParams();

      expect(params.ConsistentRead).toBe(true);
      expect(params.ReturnConsumedCapacity).toBe('INDEXES');
    });

    it('should chain all methods together', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const params = builder
        .select(['name', 'status'])
        .consistentRead()
        .returnConsumedCapacity('TOTAL')
        .dbParams();

      expect(params.ProjectionExpression).toBe('#name, #status');
      expect(params.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#status': 'status',
      });
      expect(params.ConsistentRead).toBe(true);
      expect(params.ReturnConsumedCapacity).toBe('TOTAL');
    });

    it('should maintain immutability - original builder unchanged', () => {
      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const builder2 = builder.select(['username']);
      const builder3 = builder2.returnConsumedCapacity('TOTAL');

      // Original builder should not have projection
      const params1 = builder.dbParams();
      expect(params1.ProjectionExpression).toBeUndefined();
      expect(params1.ReturnConsumedCapacity).toBeUndefined();

      // Builder2 should have projection but not returnConsumedCapacity
      const params2 = builder2.dbParams();
      expect(params2.ProjectionExpression).toBe('#username');
      expect(params2.ReturnConsumedCapacity).toBeUndefined();

      // Builder3 should have both
      const params3 = builder3.dbParams();
      expect(params3.ProjectionExpression).toBe('#username');
      expect(params3.ReturnConsumedCapacity).toBe('TOTAL');
    });
  });

  describe('execute()', () => {
    it('should send GetCommand with correct parameters', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { username: 'alice', email: 'alice@example.com' },
      });

      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#alice', SK: 'USER#alice' },
        client
      );

      const result = await builder
        .select(['username', 'email'])
        .returnConsumedCapacity('TOTAL')
        .execute();

      expect(result).toEqual({ username: 'alice', email: 'alice@example.com' });

      // Verify the command was called with correct params
      const calls = ddbMock.commandCalls(GetCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.args[0]?.input).toMatchObject({
        TableName: 'TestTable',
        Key: { PK: 'USER#alice', SK: 'USER#alice' },
        ProjectionExpression: '#username, #email',
        ExpressionAttributeNames: {
          '#username': 'username',
          '#email': 'email',
        },
        ReturnConsumedCapacity: 'TOTAL',
      });
    });

    it('should return undefined when item not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const builder = createGetBuilder<any, TestUser>(
        'TestTable',
        { PK: 'USER#notfound', SK: 'USER#notfound' },
        client
      );

      const result = await builder.execute();

      expect(result).toBeUndefined();
    });
  });
});
