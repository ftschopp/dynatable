/**
 * @ftschopp/dynatable-migrations
 * DynamoDB migration tool for single table design with schema versioning
 */

// Types
export * from './types';

// Core
export { DynamoDBMigrationTracker } from './core/tracker';
export { MigrationLoader } from './core/loader';
export { MigrationRunner, type RunOptions } from './core/runner';
export { ConfigLoader, loadConfig } from './core/config';
export { createDynamoDBClient } from './core/client';

// Template
export { generateMigrationTemplate } from './templates/migration';

// Commands (for programmatic use)
export { createMigration } from './commands/create';
export { runMigrations } from './commands/up';
export { rollbackMigrations } from './commands/down';
export { showStatus } from './commands/status';
export { initProject } from './commands/init';
