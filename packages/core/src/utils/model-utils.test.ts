/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  applyPostDefaults,
  collectInternalKeyColumns,
  computeIndexUpdates,
  stripInternalKeys,
} from './model-utils';
import { IndexesDefinition, ModelDefinition } from '../core/types';

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

describe('stripInternalKeys', () => {
  test('should remove PK, SK, and _type from object', () => {
    const input = {
      PK: 'USER#alice',
      SK: 'USER#alice',
      _type: 'User',
      username: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
    };

    const result = stripInternalKeys(input);

    expect(result).toEqual({
      username: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  test('should handle object without internal keys', () => {
    const input = {
      username: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
    };

    const result = stripInternalKeys(input);

    expect(result).toEqual(input);
  });

  test('should handle array of objects', () => {
    const input = [
      {
        PK: 'USER#alice',
        SK: 'USER#alice',
        _type: 'User',
        username: 'alice',
        name: 'Alice',
      },
      {
        PK: 'USER#bob',
        SK: 'USER#bob',
        _type: 'User',
        username: 'bob',
        name: 'Bob',
      },
    ];

    const result = stripInternalKeys(input);

    expect(result).toEqual([
      { username: 'alice', name: 'Alice' },
      { username: 'bob', name: 'Bob' },
    ]);
  });

  test('should handle undefined', () => {
    const result = stripInternalKeys(undefined);
    expect(result).toBeUndefined();
  });

  test('should handle null', () => {
    const result = stripInternalKeys(null);
    expect(result).toBeNull();
  });

  test('should handle empty object', () => {
    const input = {};
    const result = stripInternalKeys(input);
    expect(result).toEqual({});
  });

  test('should handle empty array', () => {
    const input: any[] = [];
    const result = stripInternalKeys(input);
    expect(result).toEqual([]);
  });

  test('should preserve other fields with similar names', () => {
    const input = {
      PK: 'USER#alice',
      SK: 'USER#alice',
      _type: 'User',
      PKG: 'package-name',
      SKIP: 'skip-value',
      type: 'customer',
      username: 'alice',
    };

    const result = stripInternalKeys(input);

    expect(result).toEqual({
      PKG: 'package-name',
      SKIP: 'skip-value',
      type: 'customer',
      username: 'alice',
    });
  });

  test('strips internal keys from nested plain objects too', () => {
    const input = {
      PK: 'USER#alice',
      SK: 'USER#alice',
      _type: 'User',
      username: 'alice',
      metadata: {
        PK: 'METADATA#1',
        SK: 'METADATA#1',
        _type: 'Metadata',
        value: 'test',
      },
    };

    const result = stripInternalKeys(input);

    expect(result).toEqual({
      username: 'alice',
      metadata: { value: 'test' },
    });
  });

  test('strips internal keys from objects nested inside arrays', () => {
    const input = {
      PK: 'USER#alice',
      _type: 'User',
      friends: [
        { PK: 'USER#bob', _type: 'User', username: 'bob' },
        { PK: 'USER#carol', _type: 'User', username: 'carol' },
      ],
    };

    const result = stripInternalKeys(input);

    expect(result).toEqual({
      friends: [{ username: 'bob' }, { username: 'carol' }],
    });
  });

  test('preserves Date instances instead of recursing into them', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    const input = {
      PK: 'USER#alice',
      _type: 'User',
      createdAt: date,
    };

    const result = stripInternalKeys(input) as { createdAt: Date };
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBe(date.getTime());
  });

  test('strips schema-derived GSI columns when passed a custom internalKeys list', () => {
    // The hardcoded fallback only strips PK/SK/_type, so GSI1PK/GSI1SK leak
    // through. Passing a schema-derived list closes that gap.
    const input = {
      PK: 'PL#photo1',
      SK: 'LIKE#alice',
      GSI1PK: 'PL#photo1',
      GSI1SK: 'LIKE#01H...',
      _type: 'Like',
      photoId: 'photo1',
      likingUsername: 'alice',
    };

    const internalKeys = ['PK', 'SK', 'GSI1PK', 'GSI1SK', '_type'];

    expect(stripInternalKeys(input, internalKeys)).toEqual({
      photoId: 'photo1',
      likingUsername: 'alice',
    });
  });

  test('handles custom-named primary keys (e.g., lowercase pk/sk)', () => {
    const input = {
      pk: 'USER#alice',
      sk: 'PROFILE',
      _type: 'User',
      username: 'alice',
    };

    expect(stripInternalKeys(input, ['pk', 'sk', '_type'])).toEqual({
      username: 'alice',
    });

    // The default fallback would NOT strip lowercase pk/sk — sanity check.
    expect(stripInternalKeys(input)).toEqual({
      pk: 'USER#alice',
      sk: 'PROFILE',
      username: 'alice',
    });
  });

  test('forwards the custom internalKeys list through nested structures', () => {
    const input = {
      PK: 'USER#alice',
      GSI1PK: 'AUDIT#2025',
      friends: [
        { PK: 'USER#bob', GSI1PK: 'AUDIT#2025', name: 'bob' },
        { PK: 'USER#carol', GSI1PK: 'AUDIT#2025', name: 'carol' },
      ],
    };

    expect(stripInternalKeys(input, ['PK', 'GSI1PK'])).toEqual({
      friends: [{ name: 'bob' }, { name: 'carol' }],
    });
  });
});

describe('collectInternalKeyColumns', () => {
  test('returns the conventional set for primary + GSI1', () => {
    const indexes: IndexesDefinition = {
      primary: { hash: 'PK', sort: 'SK' },
      gsi1: { hash: 'GSI1PK', sort: 'GSI1SK' },
    };

    const result = collectInternalKeyColumns(indexes);

    // Order: insertion order from the schema, with `_type` appended.
    expect(result).toEqual(['PK', 'SK', 'GSI1PK', 'GSI1SK', '_type']);
  });

  test('handles a hash-only primary index (no sort key)', () => {
    const indexes: IndexesDefinition = {
      primary: { hash: 'PK' },
    };

    expect(collectInternalKeyColumns(indexes)).toEqual(['PK', '_type']);
  });

  test('handles non-conventional column names', () => {
    const indexes: IndexesDefinition = {
      primary: { hash: 'pk', sort: 'sk' },
      lookup: { hash: 'lookupPK', sort: 'lookupSK' },
    };

    expect(collectInternalKeyColumns(indexes)).toEqual([
      'pk',
      'sk',
      'lookupPK',
      'lookupSK',
      '_type',
    ]);
  });

  test('deduplicates when an index reuses the primary hash column', () => {
    const indexes: IndexesDefinition = {
      primary: { hash: 'PK', sort: 'SK' },
      shared: { hash: 'PK', sort: 'AltSK' },
    };

    expect(collectInternalKeyColumns(indexes)).toEqual(['PK', 'SK', 'AltSK', '_type']);
  });

  test('always includes _type even with no indexes provided', () => {
    expect(collectInternalKeyColumns(undefined)).toEqual(['_type']);
  });
});

describe('computeIndexUpdates', () => {
  const personnelModel: ModelDefinition = {
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
    },
  };

  test('returns empty result when model has no indexes', () => {
    const noIndexModel: ModelDefinition = {
      key: {
        PK: { type: String, value: 'USER#${id}' },
        SK: { type: String, value: 'USER#${id}' },
      },
      attributes: { id: { type: String, required: true } },
    };
    const result = computeIndexUpdates(noIndexModel, { id: '1' }, { name: 'X' });
    expect(result).toEqual({ actions: {}, missing: [] });
  });

  test('skips indexes whose template references no updated field', () => {
    // Updating only "role" — none of the index templates mention role.
    const result = computeIndexUpdates(
      personnelModel,
      { id: '1' },
      { role: 'pilot' }
    );
    expect(result).toEqual({ actions: {}, missing: [] });
  });

  test('recomputes an affected index when all template vars resolve', () => {
    const result = computeIndexUpdates(
      personnelModel,
      { id: '1' },
      { firstName: 'Ada', lastName: 'Lovelace' }
    );
    expect(result.actions).toEqual({ GSI1SK: 'PERSON#Lovelace#Ada' });
    expect(result.missing).toEqual([]);
  });

  test('reports missing template vars instead of throwing', () => {
    const result = computeIndexUpdates(
      personnelModel,
      { id: '1' },
      { lastName: 'Lovelace' }
    );
    expect(result.actions).toEqual({});
    expect(result.missing).toEqual([
      {
        index: 'GSI1SK',
        template: 'PERSON#${lastName}#${firstName}',
        missing: ['firstName'],
      },
    ]);
  });

  test('uses keyVars to resolve fields not present in updates', () => {
    // airportId is not in updates but in keyVars — GSI1PK should still resolve.
    const result = computeIndexUpdates(
      personnelModel,
      { id: '1', airportId: 'EZE' },
      { airportId: 'AEP' } // changing it
    );
    expect(result.actions).toEqual({ GSI1PK: 'AIRPORT#AEP' });
  });

  test('handles multiple affected indexes independently', () => {
    const result = computeIndexUpdates(
      personnelModel,
      { id: '1' },
      { airportId: 'AEP', firstName: 'Ada', lastName: 'Lovelace' }
    );
    expect(result.actions).toEqual({
      GSI1PK: 'AIRPORT#AEP',
      GSI1SK: 'PERSON#Lovelace#Ada',
    });
    expect(result.missing).toEqual([]);
  });
});
