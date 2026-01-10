/* eslint-disable @typescript-eslint/no-explicit-any */
import { applyPostDefaults } from './model-utils';
import { ModelDefinition } from '../core/types';

describe('applyPostDefaults - Timestamps', () => {
  const testModel: ModelDefinition = {
    key: {
      PK: { type: String, value: 'USER#${username}' },
      SK: { type: String, value: 'USER#${username}' },
    },
    attributes: {
      username: { type: String, required: true },
      name: { type: String },
      email: { type: String },
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Timestamps disabled (default)', () => {
    test('should not add timestamps when disabled', () => {
      const input = { username: 'alice', name: 'Alice' };
      const result = applyPostDefaults(testModel, input, { timestamps: false });

      expect(result.createdAt).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });

    test('should not add timestamps when option not provided', () => {
      const input = { username: 'alice', name: 'Alice' };
      const result = applyPostDefaults(testModel, input);

      expect(result.createdAt).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });
  });

  describe('Timestamps enabled for new items', () => {
    test('should add createdAt and updatedAt for new items', () => {
      const input = { username: 'alice', name: 'Alice' };
      const result = applyPostDefaults(testModel, input, {
        timestamps: true,
        isUpdate: false,
      });

      expect(result.createdAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });

    test('should not override existing createdAt', () => {
      const existingCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      const input = {
        username: 'alice',
        name: 'Alice',
        createdAt: existingCreatedAt,
      };
      const result = applyPostDefaults(testModel, input, {
        timestamps: true,
        isUpdate: false,
      });

      expect(result.createdAt).toEqual(existingCreatedAt);
      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });

    test('should work with other defaults', () => {
      const modelWithDefaults: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${username}' },
          SK: { type: String, value: 'USER#${username}' },
        },
        attributes: {
          username: { type: String, required: true },
          name: { type: String },
          status: { type: String, default: 'active' },
          score: { type: Number, default: 0 },
        },
      };

      const input = { username: 'alice', name: 'Alice' };
      const result = applyPostDefaults(modelWithDefaults, input, {
        timestamps: true,
        isUpdate: false,
      });

      expect(result.status).toBe('active');
      expect(result.score).toBe(0);
      expect(result.createdAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });
  });

  describe('Timestamps enabled for updates', () => {
    test('should only add updatedAt for updates', () => {
      const input = { username: 'alice', name: 'Alice Updated' };
      const result = applyPostDefaults(testModel, input, {
        timestamps: true,
        isUpdate: true,
      });

      expect(result.createdAt).toBeUndefined();
      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });

    test('should update updatedAt even if already present', () => {
      const oldUpdatedAt = new Date('2024-01-01T00:00:00.000Z');
      const input = {
        username: 'alice',
        name: 'Alice Updated',
        updatedAt: oldUpdatedAt,
      };
      const result = applyPostDefaults(testModel, input, {
        timestamps: true,
        isUpdate: true,
      });

      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(result.updatedAt).not.toEqual(oldUpdatedAt);
    });

    test('should preserve existing createdAt on update', () => {
      const existingCreatedAt = new Date('2024-01-01T00:00:00.000Z');
      const input = {
        username: 'alice',
        name: 'Alice Updated',
        createdAt: existingCreatedAt,
      };
      const result = applyPostDefaults(testModel, input, {
        timestamps: true,
        isUpdate: true,
      });

      expect(result.createdAt).toEqual(existingCreatedAt);
      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });
  });

  describe('Generated values with timestamps', () => {
    test('should work with ULID generation', () => {
      const modelWithUlid: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${id}' },
          SK: { type: String, value: 'USER#${id}' },
        },
        attributes: {
          id: { type: String, generate: 'ulid' },
          username: { type: String, required: true },
        },
      };

      const input = { username: 'alice' };
      const result = applyPostDefaults(modelWithUlid, input, {
        timestamps: true,
        isUpdate: false,
      });

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.createdAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });

    test('should work with UUID generation', () => {
      const modelWithUuid: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${id}' },
          SK: { type: String, value: 'USER#${id}' },
        },
        attributes: {
          id: { type: String, generate: 'uuid' },
          username: { type: String, required: true },
        },
      };

      const input = { username: 'alice' };
      const result = applyPostDefaults(modelWithUuid, input, {
        timestamps: true,
        isUpdate: false,
      });

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(result.createdAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty input', () => {
      const input = {};
      const result = applyPostDefaults(testModel, input, {
        timestamps: true,
        isUpdate: false,
      });

      expect(result.createdAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(result.updatedAt).toEqual('2024-01-15T10:00:00.000Z');
    });

    test('should handle multiple consecutive calls with different times', () => {
      const input1 = { username: 'alice' };
      const input2 = { username: 'bob' };

      jest.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
      const result1 = applyPostDefaults(testModel, input1, {
        timestamps: true,
        isUpdate: false,
      });

      jest.setSystemTime(new Date('2024-01-15T11:00:00.000Z'));
      const result2 = applyPostDefaults(testModel, input2, {
        timestamps: true,
        isUpdate: false,
      });

      expect(result1.createdAt).toEqual('2024-01-15T10:00:00.000Z');
      expect(result1.updatedAt).toEqual('2024-01-15T10:00:00.000Z');

      expect(result2.createdAt).toEqual('2024-01-15T11:00:00.000Z');
      expect(result2.updatedAt).toEqual('2024-01-15T11:00:00.000Z');
    });
  });
});
