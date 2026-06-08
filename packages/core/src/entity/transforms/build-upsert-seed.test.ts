import { ModelDefinition } from '@/core/types';
import { buildUpsertSeedActions } from './build-upsert-seed';

const userModel = {
  key: {
    PK: { type: String, value: 'USER#${username}' },
    SK: { type: String, value: 'USER#${username}' },
  },
  attributes: {
    username: { type: String, required: true },
    name: { type: String },
  },
} as unknown as ModelDefinition;

const compositeModel = {
  key: {
    PK: { type: String, value: 'TENANT#${tenantId}' },
    SK: { type: String, value: 'OPERATION#${id}' },
  },
  attributes: {
    tenantId: { type: String, required: true },
    id: { type: String, required: true },
  },
} as unknown as ModelDefinition;

describe('buildUpsertSeedActions', () => {
  test('always seeds the `_type` discriminator first', () => {
    const [first] = buildUpsertSeedActions(userModel, 'User', { username: 'jane' });

    expect(first).toEqual({
      expression: '#_type = :_type',
      names: { '#_type': '_type' },
      values: { ':_type': 'User' },
    });
  });

  test('materializes a single primary-key template var', () => {
    const actions = buildUpsertSeedActions(userModel, 'User', { username: 'jane' });

    expect(actions).toContainEqual({
      expression: '#username = :_key_username',
      names: { '#username': 'username' },
      values: { ':_key_username': 'jane' },
    });
  });

  test('dedupes a var that appears in both PK and SK to one action', () => {
    const usernameActions = buildUpsertSeedActions(userModel, 'User', {
      username: 'jane',
    }).filter((a) => a.expression.startsWith('#username'));

    expect(usernameActions).toHaveLength(1);
  });

  test('materializes every var across a composite key', () => {
    const actions = buildUpsertSeedActions(compositeModel, 'Operation', {
      tenantId: 't1',
      id: 'op1',
    });

    expect(actions).toContainEqual({
      expression: '#tenantId = :_key_tenantId',
      names: { '#tenantId': 'tenantId' },
      values: { ':_key_tenantId': 't1' },
    });
    expect(actions).toContainEqual({
      expression: '#id = :_key_id',
      names: { '#id': 'id' },
      values: { ':_key_id': 'op1' },
    });
  });

  test('uses only fixed placeholders so caller value numbering is untouched', () => {
    const actions = buildUpsertSeedActions(compositeModel, 'Operation', {
      tenantId: 't1',
      id: 'op1',
    });

    // No seeded value may use the counter-based `:<attr>_<n>` shape the builder
    // assigns to the caller's own `.set()` values.
    const allValueNames = actions.flatMap((a) => Object.keys(a.values ?? {}));
    for (const name of allValueNames) {
      expect(name).not.toMatch(/_\d+$/);
    }
  });

  test('skips key vars whose value is undefined', () => {
    const actions = buildUpsertSeedActions(compositeModel, 'Operation', {
      tenantId: 't1',
      // id intentionally omitted
    });

    expect(actions.some((a) => a.expression.startsWith('#id'))).toBe(false);
    expect(actions.some((a) => a.expression.startsWith('#tenantId'))).toBe(true);
  });
});
