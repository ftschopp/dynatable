import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  ScanCommand,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  TransactGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { MigrationConfig, MigrationContext, MigrationFile, MigrationStatus } from '../types';
import { createMigrationTracker, MigrationTrackerHandle } from './tracker';
import { createMigrationLoader, MigrationLoaderHandle } from './loader';
import { compareSemver } from './semver';
import { startLockHeartbeat } from './lock-heartbeat';

export interface RunOptions {
  limit?: number;
  dryRun?: boolean;
}

export interface MigrationRunnerHandle {
  initialize(): Promise<void>;
  up(options?: RunOptions): Promise<MigrationFile[]>;
  down(steps?: number, dryRun?: boolean): Promise<MigrationFile[]>;
  status(): Promise<MigrationStatus[]>;
  getCurrentVersion(): Promise<string | null>;
  reset(): Promise<void>;
}

const DYNAMODB_COMMANDS = {
  ScanCommand,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  TransactGetCommand,
};

const createContext = (
  client: DynamoDBDocumentClient,
  config: MigrationConfig,
  tracker: MigrationTrackerHandle
): MigrationContext => ({
  client,
  tableName: config.tableName,
  tracker,
  config,
  dynamodb: DYNAMODB_COMMANDS,
});

/**
 * Run the body under an exclusive migration lock with a refreshing heartbeat.
 * Skipped entirely when `dryRun` is true so dry runs never need the lock.
 */
const withLock = async <T>(
  tracker: MigrationTrackerHandle,
  dryRun: boolean,
  body: () => Promise<T>
): Promise<T> => {
  if (dryRun) return body();

  const lockAcquired = await tracker.acquireLock();
  if (!lockAcquired) {
    throw new Error(
      'Could not acquire migration lock. Another migration may be in progress. ' +
        'If you believe this is an error, wait a few minutes and try again.'
    );
  }
  const stopHeartbeat = startLockHeartbeat(tracker, tracker.lockTtlSeconds);
  try {
    return await body();
  } finally {
    // Always stop the heartbeat and release the lock — in that order, so
    // we don't refresh a lock we're about to delete.
    stopHeartbeat();
    await tracker.releaseLock();
  }
};

export const createMigrationRunner = (
  client: DynamoDBDocumentClient,
  config: MigrationConfig
): MigrationRunnerHandle => {
  const tracker = createMigrationTracker(client, config);
  const loader = createMigrationLoader(config.migrationsDir || './migrations');

  const initialize = (): Promise<void> => tracker.initialize();

  const up = async (options: RunOptions = {}): Promise<MigrationFile[]> => {
    const { limit, dryRun = false } = options;

    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      throw new Error(
        `runner.up({ limit }) requires a positive integer (got ${JSON.stringify(limit)}).`
      );
    }

    await initialize();

    return withLock(tracker, dryRun, () => runPending(tracker, loader, client, config, limit, dryRun));
  };

  const down = async (steps: number = 1, dryRun: boolean = false): Promise<MigrationFile[]> => {
    if (!Number.isInteger(steps) || steps <= 0) {
      throw new Error(
        `runner.down(steps) requires a positive integer (got ${JSON.stringify(steps)}).`
      );
    }

    await initialize();

    return withLock(tracker, dryRun, () => runRollback(tracker, loader, client, config, steps, dryRun));
  };

  const status = async (): Promise<MigrationStatus[]> => {
    await initialize();
    const [allMigrations, appliedMigrations] = await Promise.all([
      loader.loadMigrations(),
      tracker.getAppliedMigrations(),
    ]);

    const appliedMap = new Map(appliedMigrations.map((m) => [m.version, m]));

    return allMigrations.map((migrationFile) => {
      const record = appliedMap.get(migrationFile.version);

      if (!record) {
        return {
          version: migrationFile.version,
          name: migrationFile.name,
          status: 'pending' as const,
        };
      }

      return {
        version: record.version,
        name: record.name,
        status: record.status,
        appliedAt: record.appliedAt,
        error: record.error,
      };
    });
  };

  const getCurrentVersion = async (): Promise<string | null> => {
    await initialize();
    return tracker.getCurrentVersion();
  };

  const reset = async (): Promise<void> => {
    const appliedMigrations = await tracker.getAppliedMigrations();
    const appliedCount = appliedMigrations.filter((m) => m.status === 'applied').length;

    if (appliedCount === 0) {
      console.log('✅ No migrations to reset');
      return;
    }

    console.log(`\n⚠️  Resetting ${appliedCount} migration(s)\n`);
    await down(appliedCount);
  };

  return { initialize, up, down, status, getCurrentVersion, reset };
};

const runPending = async (
  tracker: MigrationTrackerHandle,
  loader: MigrationLoaderHandle,
  client: DynamoDBDocumentClient,
  config: MigrationConfig,
  limit: number | undefined,
  dryRun: boolean
): Promise<MigrationFile[]> => {
  const appliedMigrations = await tracker.getAppliedMigrations();
  const appliedVersions = appliedMigrations
    .filter((m) => m.status === 'applied')
    .map((m) => m.version);

  // Load every migration once and index by version. Without this, the
  // checksum-mismatch loop below would call `loader.getMigration(...)`
  // for each applied migration — and each of those re-reads the
  // directory and re-imports every file. The loader caches the result
  // internally, but going through a Map here also flattens the per-call
  // microtask overhead.
  const allMigrations = await loader.loadMigrations();
  const migrationByVersion = new Map(allMigrations.map((m) => [m.version, m]));

  // Check for checksum mismatches on applied migrations
  appliedMigrations
    .filter((m) => m.status === 'applied')
    .forEach((applied) => {
      const file = migrationByVersion.get(applied.version);
      if (file && applied.checksum && file.checksum !== applied.checksum) {
        console.warn(
          `⚠️  Warning: Migration ${applied.version} has been modified since it was applied. ` +
            `Original checksum: ${applied.checksum}, Current: ${file.checksum}`
        );
      }
    });

  const pendingAll = allMigrations.filter((m) => !appliedVersions.includes(m.version));
  const pendingMigrations = limit ? pendingAll.slice(0, limit) : pendingAll;

  if (pendingMigrations.length === 0) {
    console.log('✅ No pending migrations');
    return [];
  }

  if (dryRun) {
    console.log(`\n🔍 DRY RUN - Would apply ${pendingMigrations.length} migration(s):\n`);
    pendingMigrations.forEach((migrationFile) => {
      console.log(`   ${migrationFile.version}: ${migrationFile.name}`);
      if (migrationFile.migration.description) {
        console.log(`      ${migrationFile.migration.description}`);
      }
    });
    console.log('\nNo changes were made.\n');
    return pendingMigrations;
  }

  console.log(`\n📦 Found ${pendingMigrations.length} pending migration(s)\n`);

  const context = createContext(client, config, tracker);
  const executed: MigrationFile[] = [];

  for (const migrationFile of pendingMigrations) {
    try {
      console.log(`⬆️  Applying ${migrationFile.version}: ${migrationFile.name}`);
      await migrationFile.migration.up(context);
      await tracker.markAsApplied(
        migrationFile.version,
        migrationFile.name,
        migrationFile.migration.schema,
        undefined,
        migrationFile.checksum
      );
      console.log(`✅ Applied ${migrationFile.version}: ${migrationFile.name}\n`);
      executed.push(migrationFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to apply ${migrationFile.version}: ${message}\n`);
      await tracker.markAsFailed(migrationFile.version, message);
      throw new Error(`Migration ${migrationFile.version} failed: ${message}`);
    }
  }

  return executed;
};

const runRollback = async (
  tracker: MigrationTrackerHandle,
  loader: MigrationLoaderHandle,
  client: DynamoDBDocumentClient,
  config: MigrationConfig,
  steps: number,
  dryRun: boolean
): Promise<MigrationFile[]> => {
  const appliedMigrations = await tracker.getAppliedMigrations();
  // Full applied list, semver-descending. We need the whole thing (not
  // just the slice we're about to roll back) so we can tell the tracker
  // what version the CURRENT pointer should fall back to after each
  // step — without making it re-Query the migration history every time.
  const allApplied = appliedMigrations
    .filter((m) => m.status === 'applied')
    .sort((a, b) => compareSemver(b.version, a.version));
  const applied = allApplied.slice(0, steps);

  if (applied.length === 0) {
    console.log('✅ No migrations to rollback');
    return [];
  }

  if (dryRun) {
    console.log(`\n🔍 DRY RUN - Would rollback ${applied.length} migration(s):\n`);
    applied.forEach((record) => console.log(`   ${record.version}: ${record.name}`));
    console.log('\nNo changes were made.\n');
    return [];
  }

  console.log(`\n📦 Rolling back ${applied.length} migration(s)\n`);

  // Load every migration once. The loader caches internally, but routing
  // through a Map here keeps the hot loop free of per-call awaits.
  const allMigrations = await loader.loadMigrations();
  const migrationByVersion = new Map(allMigrations.map((m) => [m.version, m]));

  const context = createContext(client, config, tracker);
  const rolledBack: MigrationFile[] = [];

  for (const [i, record] of applied.entries()) {
    try {
      const migrationFile = migrationByVersion.get(record.version);

      if (!migrationFile) {
        throw new Error(`Migration file not found for version ${record.version}`);
      }

      console.log(`⬇️  Rolling back ${migrationFile.version}: ${migrationFile.name}`);
      await migrationFile.migration.down(context);

      // After rolling this one back, the new CURRENT is whatever applied
      // version sits one slot deeper in `allApplied`. If we've consumed
      // the whole list, fall back to v0000 (no schema applied).
      const previousVersion = allApplied[i + 1]?.version ?? 'v0000';
      await tracker.markAsRolledBack(migrationFile.version, previousVersion);

      console.log(`✅ Rolled back ${migrationFile.version}: ${migrationFile.name}\n`);
      rolledBack.push(migrationFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to rollback ${record.version}: ${message}\n`);
      await tracker.markAsFailed(record.version, message);
      throw new Error(`Rollback of ${record.version} failed: ${message}`);
    }
  }

  return rolledBack;
};
