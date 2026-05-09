/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBMigrationTracker, DEFAULT_LOCK_TTL_SECONDS } from './tracker';
import type { MigrationConfig } from '../types';

const ddbMock = mockClient(DynamoDBDocumentClient);

const baseConfig: MigrationConfig = {
  tableName: 'TestTable',
  client: { region: 'us-east-1' },
};

function makeTracker(config: Partial<MigrationConfig> = {}) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  return new DynamoDBMigrationTracker(client, { ...baseConfig, ...config });
}

beforeEach(() => {
  ddbMock.reset();
});

describe('DynamoDBMigrationTracker - lock TTL', () => {
  test('uses the default 5-minute TTL when none is configured', () => {
    const tracker = makeTracker();
    expect(tracker.lockTtlSeconds).toBe(DEFAULT_LOCK_TTL_SECONDS);
  });

  test('honors a custom lockTtlSeconds from config', () => {
    const tracker = makeTracker({ lockTtlSeconds: 30 });
    expect(tracker.lockTtlSeconds).toBe(30);
  });
});

describe('DynamoDBMigrationTracker - acquireLock', () => {
  test('uses <= for the expiry boundary so simultaneous-ms expiries are takeable', async () => {
    ddbMock.on(PutCommand).resolves({});
    const tracker = makeTracker();

    await tracker.acquireLock();

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    const expr = (calls[0]!.args[0].input as any).ConditionExpression as string;
    expect(expr).toContain('expiresAt <= :now');
  });

  test('returns false when the lock row exists and has not expired', async () => {
    const err = Object.assign(new Error('cond failed'), {
      name: 'ConditionalCheckFailedException',
    });
    ddbMock.on(PutCommand).rejects(err);
    const tracker = makeTracker();

    await expect(tracker.acquireLock()).resolves.toBe(false);
  });
});

describe('DynamoDBMigrationTracker - refreshLock', () => {
  test('extends the lock with a ConditionExpression on the current lockId', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const tracker = makeTracker({ lockTtlSeconds: 60 });
    await tracker.acquireLock();
    await tracker.refreshLock();

    const updates = ddbMock.commandCalls(UpdateCommand);
    expect(updates).toHaveLength(1);
    const input = updates[0]!.args[0].input as any;
    expect(input.ConditionExpression).toBe('lockId = :lockId');
    expect(typeof input.ExpressionAttributeValues[':lockId']).toBe('string');
    expect(typeof input.ExpressionAttributeValues[':exp']).toBe('number');
  });

  test('throws when the lockId no longer matches (lost race)', async () => {
    ddbMock.on(PutCommand).resolves({});
    const err = Object.assign(new Error('cond failed'), {
      name: 'ConditionalCheckFailedException',
    });
    ddbMock.on(UpdateCommand).rejects(err);

    const tracker = makeTracker();
    await tracker.acquireLock();

    await expect(tracker.refreshLock()).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    });
  });

  test('is a silent no-op when no lock has been acquired yet', async () => {
    const tracker = makeTracker();
    await expect(tracker.refreshLock()).resolves.toBeUndefined();
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });
});

describe('DynamoDBMigrationTracker - tracker writes are gated by lock ownership', () => {
  test('markAsApplied (new record path) emits a ConditionCheck on the lock row', async () => {
    ddbMock.on(PutCommand).resolves({}); // acquireLock
    ddbMock.on(TransactWriteCommand).resolves({});
    // getMigration returns no existing record → take the Put branch
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.markAsApplied('0.1.0', 'init');

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    expect(tx).toHaveLength(1);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];
    // First item should be the lock-row ConditionCheck
    expect(items[0].ConditionCheck).toBeDefined();
    expect(items[0].ConditionCheck.ConditionExpression).toBe('lockId = :lockId');
    expect(items[0].ConditionCheck.Key).toEqual({
      PK: '_SCHEMA#VERSION#LOCK',
      SK: '_SCHEMA#VERSION#LOCK',
    });
  });

  test('markAsApplied throws when no lock has been acquired', async () => {
    const tracker = makeTracker();
    await expect(tracker.markAsApplied('0.1.0', 'init')).rejects.toThrow(
      /Tracker has no active lock/i
    );
  });

  test('markAsApplied (new record path) uses attribute_not_exists(SK), not (PK)', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.markAsApplied('0.1.0', 'init');

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];
    // The Put is the second item (index 1) after the ConditionCheck
    const put = items.find((i) => i.Put);
    expect(put.Put.ConditionExpression).toBe('attribute_not_exists(SK)');
  });
});

describe('DynamoDBMigrationTracker - markAsApplied idempotency (#10)', () => {
  function cancelledTransactError(reasons: Array<{ Code?: string }>) {
    return Object.assign(new Error('Transaction cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: reasons,
    });
  }

  test('returns silently when the cancellation is because the row is already in status=applied', async () => {
    ddbMock.on(PutCommand).resolves({}); // acquireLock
    // First getMigration → no record (so we take the Put branch)
    // Second getMigration (after cancellation) → already applied
    ddbMock
      .on(GetCommand)
      .resolvesOnce({ Item: undefined })
      .resolvesOnce({
        Item: {
          PK: '_SCHEMA#VERSION',
          SK: '0.1.0',
          version: '0.1.0',
          status: 'applied',
          name: 'init',
        },
      });

    // Migration row condition fails (reasons[1]); lock check passed (reasons[0] = None)
    ddbMock.on(TransactWriteCommand).rejects(
      cancelledTransactError([{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }])
    );

    const tracker = makeTracker();
    await tracker.acquireLock();

    await expect(tracker.markAsApplied('0.1.0', 'init')).resolves.toBeUndefined();
  });

  test('throws MigrationAlreadyAppliedError when the row exists in a non-applied state', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock
      .on(GetCommand)
      .resolvesOnce({ Item: undefined })
      .resolvesOnce({
        Item: {
          PK: '_SCHEMA#VERSION',
          SK: '0.1.0',
          version: '0.1.0',
          status: 'failed',
          name: 'init',
        },
      });

    ddbMock.on(TransactWriteCommand).rejects(
      cancelledTransactError([{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }])
    );

    const tracker = makeTracker();
    await tracker.acquireLock();

    await expect(tracker.markAsApplied('0.1.0', 'init')).rejects.toMatchObject({
      name: 'MigrationAlreadyAppliedError',
      version: '0.1.0',
      currentStatus: 'failed',
    });
  });

  test('throws MigrationLockLostError when the lock-row ConditionCheck is what failed', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    ddbMock.on(TransactWriteCommand).rejects(
      cancelledTransactError([{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }])
    );

    const tracker = makeTracker();
    await tracker.acquireLock();

    await expect(tracker.markAsApplied('0.1.0', 'init')).rejects.toMatchObject({
      name: 'MigrationLockLostError',
      version: '0.1.0',
    });
  });

  test('re-throws unexpected errors unchanged', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const boom = Object.assign(new Error('upstream blew up'), { name: 'InternalServerError' });
    ddbMock.on(TransactWriteCommand).rejects(boom);

    const tracker = makeTracker();
    await tracker.acquireLock();

    await expect(tracker.markAsApplied('0.1.0', 'init')).rejects.toBe(boom);
  });

  test('idempotent path also covers the Update branch (existing record was rolled_back, applied by a racing worker)', async () => {
    ddbMock.on(PutCommand).resolves({});
    // First getMigration → existing rolled_back record (so we take the Update branch)
    // Second getMigration (after cancellation) → already applied (race)
    ddbMock
      .on(GetCommand)
      .resolvesOnce({
        Item: {
          PK: '_SCHEMA#VERSION',
          SK: '0.1.0',
          version: '0.1.0',
          status: 'rolled_back',
          name: 'init',
        },
      })
      .resolvesOnce({
        Item: {
          PK: '_SCHEMA#VERSION',
          SK: '0.1.0',
          version: '0.1.0',
          status: 'applied',
          name: 'init',
        },
      });

    ddbMock.on(TransactWriteCommand).rejects(
      cancelledTransactError([{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }])
    );

    const tracker = makeTracker();
    await tracker.acquireLock();

    await expect(tracker.markAsApplied('0.1.0', 'init')).resolves.toBeUndefined();
  });
});

describe('DynamoDBMigrationTracker - initialize', () => {
  test('writes the CURRENT pointer with attribute_not_exists(PK) so concurrent first-runs do not double-write', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});

    const tracker = makeTracker();
    await tracker.initialize();

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]!.args[0].input as any;
    expect(input.Item.PK).toBe('_SCHEMA#VERSION#CURRENT');
    expect(input.Item.currentVersion).toBe('v0000');
    expect(input.ConditionExpression).toBe('attribute_not_exists(PK)');
  });

  test('swallows ConditionalCheckFailedException when another worker initialized first', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).rejects(
      Object.assign(new Error('cond failed'), { name: 'ConditionalCheckFailedException' })
    );

    const tracker = makeTracker();
    await expect(tracker.initialize()).resolves.toBeUndefined();
  });

  test('does not Put when the CURRENT pointer already exists', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: '_SCHEMA#VERSION#CURRENT',
        SK: '_SCHEMA#VERSION#CURRENT',
        currentVersion: '0.1.0',
      },
    });

    const tracker = makeTracker();
    await tracker.initialize();
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  test('re-throws unexpected errors from the SDK', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const boom = Object.assign(new Error('upstream blew up'), { name: 'InternalServerError' });
    ddbMock.on(PutCommand).rejects(boom);

    const tracker = makeTracker();
    await expect(tracker.initialize()).rejects.toBe(boom);
  });
});

describe('DynamoDBMigrationTracker - releaseLock', () => {
  test('issues a DeleteCommand on the lock row gated by the current lockId', async () => {
    ddbMock.on(PutCommand).resolves({}); // acquireLock
    ddbMock.on(DeleteCommand).resolves({});

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.releaseLock();

    const deletes = ddbMock.commandCalls(DeleteCommand);
    expect(deletes).toHaveLength(1);
    const input = deletes[0]!.args[0].input as any;
    expect(input.Key).toEqual({
      PK: '_SCHEMA#VERSION#LOCK',
      SK: '_SCHEMA#VERSION#LOCK',
    });
    expect(input.ConditionExpression).toBe('lockId = :lockId');
    expect(typeof input.ExpressionAttributeValues[':lockId']).toBe('string');
  });

  test('is a silent no-op when no lock has been acquired', async () => {
    const tracker = makeTracker();
    await expect(tracker.releaseLock()).resolves.toBeUndefined();
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });

  test('swallows ConditionalCheckFailedException (lock already taken by someone else)', async () => {
    ddbMock.on(PutCommand).resolves({});
    const err = Object.assign(new Error('cond failed'), {
      name: 'ConditionalCheckFailedException',
    });
    ddbMock.on(DeleteCommand).rejects(err);

    const tracker = makeTracker();
    await tracker.acquireLock();

    await expect(tracker.releaseLock()).resolves.toBeUndefined();
  });

  test('clears the local lockId so subsequent tracker writes are refused', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(DeleteCommand).resolves({});

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.releaseLock();

    // After release, markAsApplied must refuse for the same reason as a
    // never-acquired tracker (no active lock).
    await expect(tracker.markAsApplied('0.1.0', 'init')).rejects.toThrow(
      /Tracker has no active lock/i
    );
  });

  test('re-throws non-conditional errors from the SDK', async () => {
    ddbMock.on(PutCommand).resolves({});
    const boom = Object.assign(new Error('upstream blew up'), { name: 'InternalServerError' });
    ddbMock.on(DeleteCommand).rejects(boom);

    const tracker = makeTracker();
    await tracker.acquireLock();

    await expect(tracker.releaseLock()).rejects.toBe(boom);
  });
});

describe('DynamoDBMigrationTracker - markAsRolledBack', () => {
  test('updates the migration row to status=rolled_back and points the current pointer at the previous applied version', async () => {
    ddbMock.on(PutCommand).resolves({}); // acquireLock
    ddbMock.on(TransactWriteCommand).resolves({});

    // Three applied migrations; rolling back the latest should set the
    // pointer to the second-to-last (0.2.0).
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { PK: '_SCHEMA#VERSION', SK: '0.1.0', version: '0.1.0', status: 'applied' },
        { PK: '_SCHEMA#VERSION', SK: '0.2.0', version: '0.2.0', status: 'applied' },
        { PK: '_SCHEMA#VERSION', SK: '0.3.0', version: '0.3.0', status: 'applied' },
      ],
    });

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.markAsRolledBack('0.3.0');

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    expect(tx).toHaveLength(1);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];

    // [0] lock-ownership ConditionCheck
    expect(items[0].ConditionCheck.ConditionExpression).toBe('lockId = :lockId');
    // [1] update migration row → status: rolled_back
    expect(items[1].Update.ExpressionAttributeValues[':status']).toBe('rolled_back');
    expect(items[1].Update.Key).toEqual({ PK: '_SCHEMA#VERSION', SK: '0.3.0' });
    // [2] move CURRENT pointer to previous applied version
    expect(items[2].Update.ExpressionAttributeValues[':version']).toBe('0.2.0');
    expect(items[2].Update.ExpressionAttributeValues[':gsi1sk']).toBe('0.2.0');
  });

  test('chooses the previous version using semver order across digit boundaries (0.10.0 → 0.9.0)', async () => {
    // Critical against the lexicographic-sort regression: "0.9.0" > "0.10.0"
    // lexicographically, but semver-wise 0.10.0 is the latest. Rolling back
    // 0.10.0 must point CURRENT at 0.9.0, not 0.1.0 or '0.2.0' or whatever
    // a string sort would pick.
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { PK: '_SCHEMA#VERSION', SK: '0.1.0', version: '0.1.0', status: 'applied' },
        { PK: '_SCHEMA#VERSION', SK: '0.9.0', version: '0.9.0', status: 'applied' },
        { PK: '_SCHEMA#VERSION', SK: '0.10.0', version: '0.10.0', status: 'applied' },
      ],
    });

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.markAsRolledBack('0.10.0');

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];
    const pointerUpdate = items[2].Update;
    expect(pointerUpdate.ExpressionAttributeValues[':version']).toBe('0.9.0');
  });

  test('falls back to v0000 when rolling back the only applied migration', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({
      Items: [{ PK: '_SCHEMA#VERSION', SK: '0.1.0', version: '0.1.0', status: 'applied' }],
    });

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.markAsRolledBack('0.1.0');

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];
    expect(items[2].Update.ExpressionAttributeValues[':version']).toBe('v0000');
  });

  test('ignores rolled_back / failed records when picking the previous version', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { PK: '_SCHEMA#VERSION', SK: '0.1.0', version: '0.1.0', status: 'applied' },
        { PK: '_SCHEMA#VERSION', SK: '0.2.0', version: '0.2.0', status: 'rolled_back' },
        { PK: '_SCHEMA#VERSION', SK: '0.3.0', version: '0.3.0', status: 'failed' },
        { PK: '_SCHEMA#VERSION', SK: '0.4.0', version: '0.4.0', status: 'applied' },
      ],
    });

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.markAsRolledBack('0.4.0');

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];
    expect(items[2].Update.ExpressionAttributeValues[':version']).toBe('0.1.0');
  });

  test('refuses to issue any write if no lock is held', async () => {
    const tracker = makeTracker();
    await expect(tracker.markAsRolledBack('0.1.0')).rejects.toThrow(/Tracker has no active lock/i);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});

describe('DynamoDBMigrationTracker - markAsApplied happy path', () => {
  test('writes a Put with version, name, status=applied, checksum, and bumps CURRENT pointer atomically', async () => {
    ddbMock.on(PutCommand).resolves({}); // acquireLock
    ddbMock.on(GetCommand).resolves({ Item: undefined }); // no existing record → Put branch
    ddbMock.on(TransactWriteCommand).resolves({});

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.markAsApplied('0.1.0', 'init', { foo: 1 }, undefined, 'abc123');

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    expect(tx).toHaveLength(1);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];

    // [0] ConditionCheck on the lock row
    expect(items[0].ConditionCheck).toBeDefined();
    // [1] Put the migration row
    expect(items[1].Put).toBeDefined();
    expect(items[1].Put.Item).toMatchObject({
      PK: '_SCHEMA#VERSION',
      SK: '0.1.0',
      version: '0.1.0',
      name: 'init',
      status: 'applied',
      schemaDefinition: { foo: 1 },
      checksum: 'abc123',
    });
    expect(items[1].Put.ConditionExpression).toBe('attribute_not_exists(SK)');
    // [2] Update CURRENT pointer to this version
    expect(items[2].Update.Key).toEqual({
      PK: '_SCHEMA#VERSION#CURRENT',
      SK: '_SCHEMA#VERSION#CURRENT',
    });
    expect(items[2].Update.ExpressionAttributeValues[':version']).toBe('0.1.0');
  });

  test('takes the Update branch when the migration row already exists in a non-applied state (e.g. rolled_back)', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(GetCommand).resolves({
      Item: { PK: '_SCHEMA#VERSION', SK: '0.1.0', version: '0.1.0', status: 'rolled_back' },
    });
    ddbMock.on(TransactWriteCommand).resolves({});

    const tracker = makeTracker();
    await tracker.acquireLock();
    await tracker.markAsApplied('0.1.0', 'init');

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];
    // Should be Update, not Put
    expect(items[1].Update).toBeDefined();
    expect(items[1].Put).toBeUndefined();
    // Refuses to re-apply something already in status=applied
    expect(items[1].Update.ConditionExpression).toBe('#status <> :status');
    expect(items[1].Update.ExpressionAttributeValues[':status']).toBe('applied');
  });
});
