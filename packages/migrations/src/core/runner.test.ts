/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { createMigrationRunner } from './runner';
import type { MigrationConfig } from '../types';

const baseConfig: MigrationConfig = {
  tableName: 'TestTable',
  client: { region: 'us-east-1' },
};

function makeRunner(config: Partial<MigrationConfig> = {}) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  return createMigrationRunner(client, { ...baseConfig, ...config });
}

describe('migrationRunner.up - input validation', () => {
  test('throws when limit is 0', async () => {
    await expect(makeRunner().up({ limit: 0 })).rejects.toThrow(/positive integer/);
  });

  test('throws when limit is negative', async () => {
    await expect(makeRunner().up({ limit: -3 })).rejects.toThrow(/positive integer/);
  });

  test('throws when limit is NaN', async () => {
    await expect(makeRunner().up({ limit: NaN })).rejects.toThrow(/positive integer/);
  });

  test('throws when limit is a non-integer (1.5)', async () => {
    await expect(makeRunner().up({ limit: 1.5 })).rejects.toThrow(/positive integer/);
  });
});

describe('migrationRunner.down - input validation', () => {
  test('throws when steps is 0', async () => {
    await expect(makeRunner().down(0)).rejects.toThrow(/positive integer/);
  });

  test('throws when steps is negative', async () => {
    await expect(makeRunner().down(-5)).rejects.toThrow(/positive integer/);
  });

  test('throws when steps is NaN', async () => {
    await expect(makeRunner().down(Number.NaN)).rejects.toThrow(/positive integer/);
  });

  test('throws when steps is a non-integer', async () => {
    await expect(makeRunner().down(2.5)).rejects.toThrow(/positive integer/);
  });
});

const ddbMock = mockClient(DynamoDBDocumentClient);

function mkTmpMigrationsDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dynatable-runner-test-'));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeMigration(dir: string, fileName: string, body: string): void {
  fs.writeFileSync(path.join(dir, fileName), body);
}

const noopMigration = (version: string, name: string) => `module.exports.migration = {
  version: '${version}',
  name: '${name}',
  up: async () => {},
  down: async () => {},
};`;

const failingMigration = (version: string, name: string, message: string) => `module.exports.migration = {
  version: '${version}',
  name: '${name}',
  up: async () => { throw new Error('${message}'); },
  down: async () => { throw new Error('${message}'); },
};`;

describe('migrationRunner.up - happy path & failure handling', () => {
  let dir: string;

  beforeEach(() => {
    ddbMock.reset();
    dir = mkTmpMigrationsDir();
  });
  afterEach(() => rmTmpDir(dir));

  test('applies all pending migrations in semver order, gates writes by lock ownership, and releases the lock at the end', async () => {
    writeMigration(dir, '0.1.0_one.js', noopMigration('0.1.0', 'one'));
    writeMigration(dir, '0.2.0_two.js', noopMigration('0.2.0', 'two'));

    // initialize → getCurrentVersion (no record) → Put initial pointer
    // Subsequent GetCommand calls (for getMigration in markAsApplied) → no existing record
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    // acquireLock + initialize Put → both succeed
    ddbMock.on(PutCommand).resolves({});
    // getAppliedMigrations → no applied migrations yet
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    // markAsApplied transactions
    ddbMock.on(TransactWriteCommand).resolves({});
    // releaseLock
    ddbMock.on(DeleteCommand).resolves({});

    const runner = makeRunner({ migrationsDir: dir });
    const executed = await runner.up();

    expect(executed.map((m) => m.version)).toEqual(['0.1.0', '0.2.0']);

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    expect(tx).toHaveLength(2);
    // Both transactions begin with the lock-ownership ConditionCheck
    for (const call of tx) {
      const items = (call.args[0].input as any).TransactItems;
      expect(items[0].ConditionCheck.ConditionExpression).toBe('lockId = :lockId');
    }

    // The lock is released at the end (DeleteCommand on the lock row)
    const deletes = ddbMock.commandCalls(DeleteCommand);
    expect(deletes).toHaveLength(1);
    expect((deletes[0]!.args[0].input as any).Key).toEqual({
      PK: '_SCHEMA#VERSION#LOCK',
      SK: '_SCHEMA#VERSION#LOCK',
    });
  });

  test('respects the `limit` option and only applies the first N pending migrations', async () => {
    writeMigration(dir, '0.1.0_one.js', noopMigration('0.1.0', 'one'));
    writeMigration(dir, '0.2.0_two.js', noopMigration('0.2.0', 'two'));
    writeMigration(dir, '0.3.0_three.js', noopMigration('0.3.0', 'three'));

    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(DeleteCommand).resolves({});

    const runner = makeRunner({ migrationsDir: dir });
    const executed = await runner.up({ limit: 2 });

    expect(executed.map((m) => m.version)).toEqual(['0.1.0', '0.2.0']);
  });

  test('on failure: marks the failing migration as failed, releases the lock, and rethrows', async () => {
    writeMigration(dir, '0.1.0_ok.js', noopMigration('0.1.0', 'ok'));
    writeMigration(dir, '0.2.0_boom.js', failingMigration('0.2.0', 'boom', 'kaboom'));

    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(DeleteCommand).resolves({});

    const runner = makeRunner({ migrationsDir: dir });

    await expect(runner.up()).rejects.toThrow(/0\.2\.0 failed.*kaboom/);

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    // Two transactions: markAsApplied(0.1.0) + markAsFailed(0.2.0).
    // markAsApplied(0.2.0) was never reached because up() threw first.
    expect(tx).toHaveLength(2);

    // The failing branch (markAsFailed) writes a row with status=failed.
    // When the row doesn't yet exist it's a Put; when it does exist it's
    // an Update. Either form should satisfy this assertion.
    const failedWrite = tx.find((call) => {
      const items = (call.args[0].input as any).TransactItems as any[];
      return items.some(
        (i: any) =>
          i.Put?.Item?.status === 'failed' ||
          i.Update?.ExpressionAttributeValues?.[':status'] === 'failed'
      );
    });
    expect(failedWrite).toBeDefined();

    // Lock is still released even though up() threw — `finally` block.
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(1);
  });

  test('throws cleanly when the lock cannot be acquired (someone else is migrating)', async () => {
    writeMigration(dir, '0.1.0_one.js', noopMigration('0.1.0', 'one'));

    ddbMock.on(GetCommand).resolves({ Item: undefined });
    // initialize Put succeeds; acquireLock Put fails with cond-check.
    ddbMock
      .on(PutCommand)
      .resolvesOnce({}) // initialize
      .rejectsOnce(
        Object.assign(new Error('cond failed'), {
          name: 'ConditionalCheckFailedException',
        })
      );
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const runner = makeRunner({ migrationsDir: dir });

    await expect(runner.up()).rejects.toThrow(/Could not acquire migration lock/);
    // Nothing was applied and no lock was released (we never owned one).
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });

  test('dry run does not acquire a lock or write to DynamoDB', async () => {
    writeMigration(dir, '0.1.0_one.js', noopMigration('0.1.0', 'one'));

    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({}); // only the initialize() pointer Put
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const runner = makeRunner({ migrationsDir: dir });
    const planned = await runner.up({ dryRun: true });

    expect(planned.map((m) => m.version)).toEqual(['0.1.0']);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });
});

describe('migrationRunner.down - happy path & failure handling', () => {
  let dir: string;

  beforeEach(() => {
    ddbMock.reset();
    dir = mkTmpMigrationsDir();
  });
  afterEach(() => rmTmpDir(dir));

  test('rolls back the latest applied migration and updates the CURRENT pointer', async () => {
    writeMigration(dir, '0.1.0_one.js', noopMigration('0.1.0', 'one'));
    writeMigration(dir, '0.2.0_two.js', noopMigration('0.2.0', 'two'));

    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});
    // Two applied migrations on disk and in tracker
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { PK: '_SCHEMA#VERSION', SK: '0.1.0', version: '0.1.0', name: 'one', status: 'applied' },
        { PK: '_SCHEMA#VERSION', SK: '0.2.0', version: '0.2.0', name: 'two', status: 'applied' },
      ],
    });
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(DeleteCommand).resolves({});

    const runner = makeRunner({ migrationsDir: dir });
    const rolledBack = await runner.down(1);

    expect(rolledBack.map((m) => m.version)).toEqual(['0.2.0']);

    const tx = ddbMock.commandCalls(TransactWriteCommand);
    expect(tx).toHaveLength(1);
    const items = (tx[0]!.args[0].input as any).TransactItems as any[];
    // [1] migration row → status=rolled_back
    expect(items[1].Update.Key).toEqual({ PK: '_SCHEMA#VERSION', SK: '0.2.0' });
    expect(items[1].Update.ExpressionAttributeValues[':status']).toBe('rolled_back');
    // [2] CURRENT pointer → previous applied version
    expect(items[2].Update.ExpressionAttributeValues[':version']).toBe('0.1.0');
  });

  test('returns [] and does not write when there are no applied migrations to roll back', async () => {
    writeMigration(dir, '0.1.0_one.js', noopMigration('0.1.0', 'one'));

    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(DeleteCommand).resolves({});

    const runner = makeRunner({ migrationsDir: dir });
    const rolledBack = await runner.down(1);

    expect(rolledBack).toEqual([]);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  test('dry run does not acquire a lock or issue any writes', async () => {
    writeMigration(dir, '0.1.0_one.js', noopMigration('0.1.0', 'one'));

    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { PK: '_SCHEMA#VERSION', SK: '0.1.0', version: '0.1.0', name: 'one', status: 'applied' },
      ],
    });

    const runner = makeRunner({ migrationsDir: dir });
    const planned = await runner.down(1, /* dryRun */ true);

    // Dry run reports nothing rolled back (the runner returns [] in this branch).
    expect(planned).toEqual([]);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });

  test('on failure inside down(): marks the migration failed, releases the lock, rethrows', async () => {
    writeMigration(dir, '0.1.0_boom.js', failingMigration('0.1.0', 'boom', 'rollback exploded'));

    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { PK: '_SCHEMA#VERSION', SK: '0.1.0', version: '0.1.0', name: 'boom', status: 'applied' },
      ],
    });
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(DeleteCommand).resolves({});

    const runner = makeRunner({ migrationsDir: dir });
    await expect(runner.down(1)).rejects.toThrow(/Rollback of 0\.1\.0 failed.*rollback exploded/);

    // markAsFailed wrote a row with status=failed. Lock was still released
    // via the `finally` block.
    const tx = ddbMock.commandCalls(TransactWriteCommand);
    const sawFailed = tx.some((call) => {
      const items = (call.args[0].input as any).TransactItems as any[];
      return items.some(
        (i: any) =>
          i.Put?.Item?.status === 'failed' ||
          i.Update?.ExpressionAttributeValues?.[':status'] === 'failed'
      );
    });
    expect(sawFailed).toBe(true);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(1);
  });
});
