#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './core/config';
import { createMigration } from './commands/create';
import { runMigrations } from './commands/up';
import { rollbackMigrations } from './commands/down';
import { showStatus } from './commands/status';
import { initProject } from './commands/init';
import { forceUnlock } from './commands/unlock';
import { parsePositiveInt } from './cli-utils';

// Read version from package.json
const packageJson = require('../package.json');

const program = new Command();

program
  .name('dynatable-migrate')
  .description('DynamoDB migration tool for single table design')
  .version(packageJson.version);

// Init command
program
  .command('init')
  .description('Initialize migrations in current project')
  .action(async () => {
    try {
      await initProject();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Create command
program
  .command('create <name>')
  .description('Create a new migration file')
  .option('-c, --config <path>', 'Path to config file')
  .option('-t, --type <type>', 'Version bump type: major, minor, or patch (default: patch)')
  .option('-e, --explicit <version>', 'Explicit version (e.g., 2.0.0)')
  .action(async (name: string, options) => {
    try {
      let migrationsDir = './migrations';

      // Try to load config to get migrations directory
      try {
        const config = await loadConfig(options.config);
        migrationsDir = config.migrationsDir || './migrations';
      } catch {
        // If config doesn't exist, use default
      }

      await createMigration(name, migrationsDir, options.type, options.explicit);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Up command
program
  .command('up')
  .description('Run pending migrations')
  .option('-c, --config <path>', 'Path to config file')
  .option('-l, --limit <number>', 'Limit number of migrations to run', parsePositiveInt('limit'))
  .option('-d, --dry-run', 'Show what would be done without making changes')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      await runMigrations(config, options.limit, options.dryRun);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Down command
program
  .command('down')
  .description('Rollback migrations')
  .option('-c, --config <path>', 'Path to config file')
  .option('-s, --steps <number>', 'Number of migrations to rollback', parsePositiveInt('steps'), 1)
  .option('-d, --dry-run', 'Show what would be done without making changes')
  .option('-y, --yes', 'Skip the interactive confirmation prompt')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      await rollbackMigrations(config, options.steps, options.dryRun, options.yes);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show migration status')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      await showStatus(config);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Unlock command — for emergency recovery when a migration process died
// hard without releasing its lock. The 5-minute TTL eventually clears
// the lock anyway, but waiting that long during an incident is rough.
program
  .command('unlock')
  .description('Forcefully release the migration lock (emergency recovery)')
  .option('-c, --config <path>', 'Path to config file')
  .option('-y, --yes', 'Skip the interactive confirmation prompt')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      await forceUnlock(config, options.yes);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
