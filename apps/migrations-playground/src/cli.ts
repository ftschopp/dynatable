#!/usr/bin/env node

import { select, confirm, input } from '@inquirer/prompts';
import { execSync } from 'child_process';
import { showTableInfo } from './actions/table-info';
import { showAllData, showDataByEntity } from './actions/view-data';
import { seedData, clearAllData } from './actions/seed-data';
import { showMigrationStatus, runMigrations, rollbackMigrations } from './actions/migrations';
import { showSnapshot, compareSnapshots } from './actions/snapshots';

type MenuAction =
  | 'table-info'
  | 'view-all-data'
  | 'view-by-entity'
  | 'seed-data'
  | 'clear-data'
  | 'migration-status'
  | 'run-migrations'
  | 'rollback-migrations'
  | 'create-migration'
  | 'snapshot'
  | 'compare-snapshots'
  | 'open-admin'
  | 'exit'
  | 'separator-1'
  | 'separator-2'
  | 'separator-3'
  | 'separator-4';

async function showMenu(): Promise<MenuAction> {
  console.log('\n');

  const action = await select<MenuAction>({
    message: 'Migrations Playground - Select an action:',
    choices: [
      {
        name: 'View Table Info',
        value: 'table-info' as const,
        description: 'Show table structure, indexes, and stats',
      },
      {
        name: 'View All Data',
        value: 'view-all-data' as const,
        description: 'Scan and display all items in table',
      },
      {
        name: 'View Data by Entity',
        value: 'view-by-entity' as const,
        description: 'Filter and view data by entity type (USER#, PRODUCT#, etc)',
      },
      {
        name: '── Data Operations ──',
        value: 'separator-1' as MenuAction,
        disabled: true,
      },
      {
        name: 'Seed Sample Data',
        value: 'seed-data' as const,
        description: 'Insert sample users, products, and orders',
      },
      {
        name: 'Clear All Data',
        value: 'clear-data' as const,
        description: 'Delete all items from the table',
      },
      {
        name: '── Migrations ──',
        value: 'separator-2' as MenuAction,
        disabled: true,
      },
      {
        name: 'Migration Status',
        value: 'migration-status' as const,
        description: 'Show pending and applied migrations',
      },
      {
        name: 'Run Migrations (up)',
        value: 'run-migrations' as const,
        description: 'Execute pending migrations',
      },
      {
        name: 'Rollback Migrations (down)',
        value: 'rollback-migrations' as const,
        description: 'Rollback applied migrations',
      },
      {
        name: 'Create New Migration',
        value: 'create-migration' as const,
        description: 'Generate a new migration file',
      },
      {
        name: '── Snapshots ──',
        value: 'separator-3' as MenuAction,
        disabled: true,
      },
      {
        name: 'Take Snapshot',
        value: 'snapshot' as const,
        description: 'Save current data state for comparison',
      },
      {
        name: 'Compare Snapshots',
        value: 'compare-snapshots' as const,
        description: 'Compare before/after migration changes',
      },
      {
        name: '── Tools ──',
        value: 'separator-4' as MenuAction,
        disabled: true,
      },
      {
        name: 'Open DynamoDB Admin',
        value: 'open-admin' as const,
        description: 'Open browser to http://localhost:8101',
      },
      {
        name: 'Exit',
        value: 'exit' as const,
        description: 'Exit the playground',
      },
    ],
  });

  return action;
}

async function handleAction(action: MenuAction): Promise<boolean> {
  try {
    switch (action) {
      case 'table-info':
        await showTableInfo();
        break;

      case 'view-all-data':
        await showAllData();
        break;

      case 'view-by-entity':
        await showDataByEntity();
        break;

      case 'seed-data':
        await seedData();
        break;

      case 'clear-data':
        const confirmClear = await confirm({
          message: 'Are you sure you want to delete ALL data?',
          default: false,
        });
        if (confirmClear) {
          await clearAllData();
        }
        break;

      case 'migration-status':
        await showMigrationStatus();
        break;

      case 'run-migrations':
        await runMigrations();
        break;

      case 'rollback-migrations':
        await rollbackMigrations();
        break;

      case 'create-migration':
        const name = await input({
          message: 'Migration name (snake_case):',
          validate: (value) => {
            if (!value) return 'Name is required';
            if (!/^[a-z][a-z0-9_]*$/.test(value)) {
              return 'Use snake_case (lowercase letters, numbers, underscores)';
            }
            return true;
          },
        });

        const bumpType = await select({
          message: 'Version bump type:',
          choices: [
            { name: 'patch (0.0.X) - Bug fixes, small changes', value: 'patch' },
            { name: 'minor (0.X.0) - New features', value: 'minor' },
            { name: 'major (X.0.0) - Breaking changes', value: 'major' },
          ],
        });

        execSync(`yarn migrate:create ${name} --type ${bumpType}`, {
          stdio: 'inherit',
        });
        break;

      case 'snapshot':
        await showSnapshot();
        break;

      case 'compare-snapshots':
        await compareSnapshots();
        break;

      case 'open-admin':
        const platform = process.platform;
        const openCmd =
          platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
        try {
          execSync(`${openCmd} http://localhost:8101`, { stdio: 'ignore' });
          console.log('\nOpened http://localhost:8101 in browser');
        } catch {
          console.log('\nOpen http://localhost:8101 in your browser');
        }
        break;

      case 'exit':
        console.log('\nBye!\n');
        return false;
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      // User pressed Ctrl+C
      return true;
    }
    console.error('\nError:', error instanceof Error ? error.message : String(error));
  }

  return true;
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     Migrations Playground CLI          ║');
  console.log('║     Test DynamoDB migrations easily    ║');
  console.log('╚════════════════════════════════════════╝');

  let running = true;

  while (running) {
    try {
      const action = await showMenu();
      running = await handleAction(action);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('\n\nBye!\n');
        break;
      }
      throw error;
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
