/**
 * @ftschopp/dynatable-migrations
 * DynamoDB migration tool for single table design with schema versioning
 */

// Types
export * from './types';

// Core
export { createMigrationTracker, type MigrationTrackerHandle } from './core/tracker';
export { createMigrationLoader, type MigrationLoaderHandle } from './core/loader';
export {
  createMigrationRunner,
  type MigrationRunnerHandle,
  type RunOptions,
} from './core/runner';
export { loadConfig, createDefaultConfig } from './core/config';
export { createDynamoDBClient } from './core/client';
export { MigrationAlreadyAppliedError, MigrationLockLostError } from './core/errors';

// Template
export { generateMigrationTemplate } from './templates/migration';

// Commands (for programmatic use)
export { createMigration } from './commands/create';
export { runMigrations } from './commands/up';
export { rollbackMigrations } from './commands/down';
export { showStatus } from './commands/status';
export { initProject } from './commands/init';
