/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
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
