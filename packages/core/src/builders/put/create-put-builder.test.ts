import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { createPutBuilder } from './create-put-builder';

const ddbMock = mockClient(DynamoDBClient);

describe('createPutBuilder', () => {
  const tableName = 'test-table';
  const client = new DynamoDBClient({});

  beforeEach(() => {
    ddbMock.reset();
  });

  describe('Basic functionality', () => {
    it('should create a put builder with minimal config', () => {
      const item = { id: '123', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client);

      const params = builder.dbParams();

      expect(params).toEqual({
        TableName: tableName,
        Item: item,
      });
    });

    it('should build params with conditions', () => {
      const item = { id: '123', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client).where((attrs, ops) =>
        ops.eq(attrs.id, '123')
      );

      const params = builder.dbParams();

      expect(params.ConditionExpression).toBe('#id = :id_0');
      expect(params.ExpressionAttributeNames).toEqual({ '#id': 'id' });
      expect(params.ExpressionAttributeValues).toEqual({ ':id_0': '123' });
    });
  });

  describe('Timestamps support', () => {
    it('should add createdAt and updatedAt when enableTimestamps is true', () => {
      const item = { id: '123', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client, [], false, 'NONE', true);

      const params = builder.dbParams();

      expect(params.Item).toHaveProperty('createdAt');
      expect(params.Item).toHaveProperty('updatedAt');
      expect(typeof params.Item.createdAt).toBe('string');
      expect(typeof params.Item.updatedAt).toBe('string');
      expect(params.Item.createdAt).toBe(params.Item.updatedAt);
    });

    it('should not add timestamps when enableTimestamps is false', () => {
      const item = { id: '123', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client, [], false, 'NONE', false);

      const params = builder.dbParams();

      expect(params.Item).not.toHaveProperty('createdAt');
      expect(params.Item).not.toHaveProperty('updatedAt');
    });

    it('should preserve original item data with timestamps', () => {
      const item = { id: '123', name: 'Test', value: 42 };
      const builder = createPutBuilder(tableName, item, client, [], false, 'NONE', true);

      const params = builder.dbParams();

      expect(params.Item.id).toBe('123');
      expect(params.Item.name).toBe('Test');
      expect(params.Item.value).toBe(42);
    });
  });

  describe('ifNotExists functionality', () => {
    it('should add attribute_not_exists conditions for PK and SK', () => {
      const item = { PK: 'user#123', SK: 'profile', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client).ifNotExists();

      const params = builder.dbParams();

      expect(params.ConditionExpression).toContain('attribute_not_exists(#PK)');
      expect(params.ConditionExpression).toContain('attribute_not_exists(#SK)');
      expect(params.ExpressionAttributeNames).toHaveProperty('#PK');
      expect(params.ExpressionAttributeNames).toHaveProperty('#SK');
    });

    it('should handle lowercase pk and sk', () => {
      const item = { pk: 'user#123', sk: 'profile', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client).ifNotExists();

      const params = builder.dbParams();

      expect(params.ConditionExpression).toContain('attribute_not_exists(#pk)');
      expect(params.ConditionExpression).toContain('attribute_not_exists(#sk)');
    });

    it('should combine ifNotExists with other conditions', () => {
      const item = { PK: 'user#123', SK: 'profile', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client)
        .where((attrs, ops) => ops.eq(attrs.name, 'Test'))
        .ifNotExists();

      const params = builder.dbParams();

      expect(params.ConditionExpression).toContain('attribute_not_exists(#PK)');
      expect(params.ConditionExpression).toContain('#name = :name_0');
    });
  });

  describe('returning functionality', () => {
    it('should set ReturnValues to NONE by default', () => {
      const item = { id: '123', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client);

      const params = builder.dbParams();

      expect(params.ReturnValues).toBeUndefined();
    });

    it('should set ReturnValues to ALL_OLD when specified', () => {
      const item = { id: '123', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client).returning('ALL_OLD');

      const params = builder.dbParams();

      expect(params.ReturnValues).toBe('ALL_OLD');
    });
  });

  describe('execute functionality', () => {
    it('should return the new item when returnMode is NONE', async () => {
      const item = { id: '123', name: 'Test' };

      ddbMock.on(PutCommand).resolves({});

      const builder = createPutBuilder(tableName, item, client);
      const result = await builder.execute();

      expect(result).toEqual(item);
    });

    it('should return the old item when returnMode is ALL_OLD and item was replaced', async () => {
      const item = { id: '123', name: 'New Name' };
      const oldItem = { id: '123', name: 'Old Name' };

      ddbMock.on(PutCommand).resolves({
        Attributes: oldItem,
      });

      const builder = createPutBuilder(tableName, item, client).returning('ALL_OLD');
      const result = await builder.execute();

      expect(result).toEqual(oldItem);
    });

    it('should return the new item when returnMode is ALL_OLD but no old item existed', async () => {
      const item = { id: '123', name: 'Test' };

      ddbMock.on(PutCommand).resolves({});

      const builder = createPutBuilder(tableName, item, client).returning('ALL_OLD');
      const result = await builder.execute();

      expect(result).toEqual(item);
    });

    it('should return item with timestamps when timestamps are enabled', async () => {
      const item = { id: '123', name: 'Test' };

      ddbMock.on(PutCommand).resolves({});

      const builder = createPutBuilder(tableName, item, client, [], false, 'NONE', true);
      const result = await builder.execute();

      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
      expect(result.id).toBe('123');
      expect(result.name).toBe('Test');
    });
  });

  describe('Method chaining', () => {
    it('should allow chaining multiple methods', () => {
      const item = { PK: 'user#123', SK: 'profile', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client)
        .where((attrs, ops) => ops.eq(attrs.name, 'Test'))
        .ifNotExists()
        .returning('ALL_OLD');

      const params = builder.dbParams();

      expect(params.ConditionExpression).toBeTruthy();
      expect(params.ReturnValues).toBe('ALL_OLD');
    });

    it('should preserve timestamps through chaining', () => {
      const item = { id: '123', name: 'Test' };
      const builder = createPutBuilder(tableName, item, client, [], false, 'NONE', true)
        .where((attrs, ops) => ops.eq(attrs.id, '123'))
        .returning('ALL_OLD');

      const params = builder.dbParams();

      expect(params.Item).toHaveProperty('createdAt');
      expect(params.Item).toHaveProperty('updatedAt');
    });
  });
});
