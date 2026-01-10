import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { MigrationConfig, MigrationContext, MigrationFile, MigrationStatus } from '../types';
import { DynamoDBMigrationTracker } from './tracker';
import { MigrationLoader } from './loader';

export class MigrationRunner {
  private client: DynamoDBDocumentClient;
  private config: MigrationConfig;
  private tracker: DynamoDBMigrationTracker;
  private loader: MigrationLoader;

  constructor(client: DynamoDBDocumentClient, config: MigrationConfig) {
    this.client = client;
    this.config = config;
    this.tracker = new DynamoDBMigrationTracker(client, config);
    this.loader = new MigrationLoader(config.migrationsDir || './migrations');
  }

  /**
   * Initialize migration system
   */
  async initialize(): Promise<void> {
    await this.tracker.initialize();
  }

  /**
   * Run all pending migrations
   */
  async up(limit?: number): Promise<MigrationFile[]> {
    await this.initialize();

    const appliedMigrations = await this.tracker.getAppliedMigrations();
    const appliedVersions = appliedMigrations
      .filter((m) => m.status === 'applied')
      .map((m) => m.version);

    let pendingMigrations = await this.loader.getPendingMigrations(appliedVersions);

    // Apply limit if specified
    if (limit) {
      pendingMigrations = pendingMigrations.slice(0, limit);
    }

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return [];
    }

    console.log(`\n📦 Found ${pendingMigrations.length} pending migration(s)\n`);

    const executed: MigrationFile[] = [];

    for (const migrationFile of pendingMigrations) {
      try {
        console.log(`⬆️  Applying ${migrationFile.version}: ${migrationFile.name}`);

        const context = this.createContext();
        await migrationFile.migration.up(context);

        await this.tracker.markAsApplied(
          migrationFile.version,
          migrationFile.name,
          migrationFile.migration.schema
        );

        console.log(`✅ Applied ${migrationFile.version}: ${migrationFile.name}\n`);
        executed.push(migrationFile);
      } catch (error: any) {
        console.error(`❌ Failed to apply ${migrationFile.version}: ${error.message}\n`);

        await this.tracker.markAsFailed(migrationFile.version, error.message);

        throw new Error(`Migration ${migrationFile.version} failed: ${error.message}`);
      }
    }

    return executed;
  }

  /**
   * Rollback last migration
   */
  async down(steps: number = 1): Promise<MigrationFile[]> {
    await this.initialize();

    const appliedMigrations = await this.tracker.getAppliedMigrations();
    const applied = appliedMigrations
      .filter((m) => m.status === 'applied')
      .sort((a, b) => b.version.localeCompare(a.version))
      .slice(0, steps);

    if (applied.length === 0) {
      console.log('✅ No migrations to rollback');
      return [];
    }

    console.log(`\n📦 Rolling back ${applied.length} migration(s)\n`);

    const rolledBack: MigrationFile[] = [];

    for (const record of applied) {
      try {
        const migrationFile = await this.loader.getMigration(record.version);

        if (!migrationFile) {
          throw new Error(`Migration file not found for version ${record.version}`);
        }

        console.log(`⬇️  Rolling back ${migrationFile.version}: ${migrationFile.name}`);

        const context = this.createContext();
        await migrationFile.migration.down(context);

        await this.tracker.markAsRolledBack(migrationFile.version);

        console.log(`✅ Rolled back ${migrationFile.version}: ${migrationFile.name}\n`);
        rolledBack.push(migrationFile);
      } catch (error: any) {
        console.error(`❌ Failed to rollback ${record.version}: ${error.message}\n`);

        await this.tracker.markAsFailed(record.version, error.message);

        throw new Error(`Rollback of ${record.version} failed: ${error.message}`);
      }
    }

    return rolledBack;
  }

  /**
   * Get migration status
   */
  async status(): Promise<MigrationStatus[]> {
    await this.initialize();

    const allMigrations = await this.loader.loadMigrations();
    const appliedMigrations = await this.tracker.getAppliedMigrations();

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
  }

  /**
   * Get current version
   */
  async getCurrentVersion(): Promise<string | null> {
    await this.initialize();
    return this.tracker.getCurrentVersion();
  }

  /**
   * Reset all migrations (rollback everything)
   */
  async reset(): Promise<void> {
    const appliedMigrations = await this.tracker.getAppliedMigrations();
    const appliedCount = appliedMigrations.filter((m) => m.status === 'applied').length;

    if (appliedCount === 0) {
      console.log('✅ No migrations to reset');
      return;
    }

    console.log(`\n⚠️  Resetting ${appliedCount} migration(s)\n`);
    await this.down(appliedCount);
  }

  /**
   * Create migration context
   */
  private createContext(): MigrationContext {
    // Import DynamoDB commands
    const {
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
    } = require('@aws-sdk/lib-dynamodb');

    return {
      client: this.client,
      tableName: this.config.tableName,
      tracker: this.tracker,
      config: this.config,
      dynamodb: {
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
      },
    };
  }
}
