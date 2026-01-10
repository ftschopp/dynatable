/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDynamoDBLogger } from './dynamodb-logger';

describe('DynamoDB Logger', () => {
  describe('createDynamoDBLogger', () => {
    it('should not log when disabled', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: false,
        logParams: true,
        logResponse: true,
        loggerFn: mockLoggerFn,
      });

      logger.log('GetCommand', { TableName: 'Users' }, { Item: { id: '123' } });

      expect(mockLoggerFn).not.toHaveBeenCalled();
    });

    it('should log when enabled', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: false,
        loggerFn: mockLoggerFn,
      });

      logger.log('GetCommand', { TableName: 'Users' });

      expect(mockLoggerFn).toHaveBeenCalledTimes(1);
      const loggedMessage = mockLoggerFn.mock.calls[0][0];
      expect(loggedMessage).toContain('[DynamoDB] GetCommand');
      expect(loggedMessage).toContain('📤 Request Parameters:');
      expect(loggedMessage).toContain('"TableName": "Users"');
    });

    it('should log both params and response when configured', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: true,
        loggerFn: mockLoggerFn,
      });

      const params = { TableName: 'Users', Key: { PK: 'USER#123' } };
      const response = { Item: { PK: 'USER#123', username: 'johndoe' } };

      logger.log('GetCommand', params, response);

      expect(mockLoggerFn).toHaveBeenCalledTimes(1);
      const loggedMessage = mockLoggerFn.mock.calls[0][0];

      expect(loggedMessage).toContain('[DynamoDB] GetCommand');
      expect(loggedMessage).toContain('📤 Request Parameters:');
      expect(loggedMessage).toContain('"TableName": "Users"');
      expect(loggedMessage).toContain('📥 Response:');
      expect(loggedMessage).toContain('"username": "johndoe"');
    });

    it('should log only response when logParams is false', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: false,
        logResponse: true,
        loggerFn: mockLoggerFn,
      });

      const params = { TableName: 'Users' };
      const response = { Item: { id: '123' } };

      logger.log('GetCommand', params, response);

      expect(mockLoggerFn).toHaveBeenCalledTimes(1);
      const loggedMessage = mockLoggerFn.mock.calls[0][0];

      expect(loggedMessage).toContain('[DynamoDB] GetCommand');
      expect(loggedMessage).not.toContain('📤 Request Parameters:');
      expect(loggedMessage).toContain('📥 Response:');
    });

    it('should log only params when logResponse is false', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: false,
        loggerFn: mockLoggerFn,
      });

      const params = { TableName: 'Users' };
      const response = { Item: { id: '123' } };

      logger.log('GetCommand', params, response);

      expect(mockLoggerFn).toHaveBeenCalledTimes(1);
      const loggedMessage = mockLoggerFn.mock.calls[0][0];

      expect(loggedMessage).toContain('[DynamoDB] GetCommand');
      expect(loggedMessage).toContain('📤 Request Parameters:');
      expect(loggedMessage).not.toContain('📥 Response:');
    });

    it('should use console.log by default when no loggerFn is provided', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: false,
      });

      logger.log('GetCommand', { TableName: 'Users' });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      consoleLogSpy.mockRestore();
    });

    it('should include operation name and timestamp in log', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: false,
        loggerFn: mockLoggerFn,
      });

      logger.log('QueryCommand', { TableName: 'Posts' });

      expect(mockLoggerFn).toHaveBeenCalledTimes(1);
      const loggedMessage = mockLoggerFn.mock.calls[0][0];

      expect(loggedMessage).toContain('[DynamoDB] QueryCommand');
      // Timestamp should be in ISO format
      expect(loggedMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should format log with proper separators', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: false,
        loggerFn: mockLoggerFn,
      });

      logger.log('GetCommand', { TableName: 'Users' });

      const loggedMessage = mockLoggerFn.mock.calls[0][0];

      // Should have separators (80 equal signs)
      expect(loggedMessage).toContain('='.repeat(80));
    });

    it('should handle undefined response gracefully', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: true,
        loggerFn: mockLoggerFn,
      });

      logger.log('GetCommand', { TableName: 'Users' }, undefined);

      expect(mockLoggerFn).toHaveBeenCalledTimes(1);
      const loggedMessage = mockLoggerFn.mock.calls[0][0];

      expect(loggedMessage).toContain('📤 Request Parameters:');
      expect(loggedMessage).not.toContain('📥 Response:');
    });

    it('should work with different operation types', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: false,
        loggerFn: mockLoggerFn,
      });

      const operations = [
        'GetCommand',
        'PutCommand',
        'UpdateCommand',
        'DeleteCommand',
        'QueryCommand',
        'ScanCommand',
      ];

      operations.forEach((op) => {
        logger.log(op, { TableName: 'Test' });
      });

      expect(mockLoggerFn).toHaveBeenCalledTimes(operations.length);

      operations.forEach((op, index) => {
        const loggedMessage = mockLoggerFn.mock.calls[index][0];
        expect(loggedMessage).toContain(`[DynamoDB] ${op}`);
      });
    });

    it('should handle complex nested objects in params and response', () => {
      const mockLoggerFn = jest.fn();
      const logger = createDynamoDBLogger({
        enabled: true,
        logParams: true,
        logResponse: true,
        loggerFn: mockLoggerFn,
      });

      const params = {
        TableName: 'Users',
        Item: {
          PK: 'USER#123',
          SK: 'PROFILE',
          nested: {
            level1: {
              level2: {
                value: 'deep',
              },
            },
          },
        },
      };

      const response = {
        Items: [
          { id: '1', data: { nested: 'value1' } },
          { id: '2', data: { nested: 'value2' } },
        ],
      };

      logger.log('QueryCommand', params, response);

      const loggedMessage = mockLoggerFn.mock.calls[0][0];

      expect(loggedMessage).toContain('"value": "deep"');
      expect(loggedMessage).toContain('"nested": "value1"');
      expect(loggedMessage).toContain('"nested": "value2"');
    });
  });
});
