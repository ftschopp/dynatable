#!/usr/bin/env node

import { input } from '@inquirer/prompts';
import { execSync } from 'child_process';
import chalk from 'chalk';
import Table from 'cli-table3';
import { showTableInfo } from './actions/table-info';
import { showAllData } from './actions/view-data';
import { seedData, clearAllData } from './actions/seed-data';
import { showSnapshot, compareSnapshots } from './actions/snapshots';
import { getItemsByEntityType } from './db';

function showHelp() {
  console.log(`
${chalk.bold('Available Commands:')}

${chalk.cyan('Migration Commands:')}
  ${chalk.yellow('status')}              Show pending and applied migrations
  ${chalk.yellow('up')}                  Run all pending migrations
  ${chalk.yellow('up <n>')}              Run up to n pending migrations
  ${chalk.yellow('down')}                Rollback the last migration
  ${chalk.yellow('down <n>')}            Rollback up to n migrations
  ${chalk.yellow('down all')}            Rollback all migrations
  ${chalk.yellow('create <name>')}       Create a new migration file

${chalk.cyan('Data Commands:')}
  ${chalk.yellow('info')}                Show table structure and stats
  ${chalk.yellow('data')}                View all data in the table
  ${chalk.yellow('data <entity>')}       View data for specific entity (user, product, order)
  ${chalk.yellow('seed')}                Insert sample data
  ${chalk.yellow('clear')}               Delete all data (requires confirmation)

${chalk.cyan('Snapshot Commands:')}
  ${chalk.yellow('snapshot')}            Take a snapshot of current data
  ${chalk.yellow('compare')}             Compare before/after snapshots

${chalk.cyan('Other:')}
  ${chalk.yellow('help')}                Show this help message
  ${chalk.yellow('exit')} / ${chalk.yellow('quit')}        Exit the REPL
`);
}

function runCliCommand(command: string): void {
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    // Errors are displayed by the command itself
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

async function showDataByEntity(entityPrefix: string): Promise<void> {
  const prefix = entityPrefix.toUpperCase().replace(/#$/, '');
  console.log(`\n📦 Items with PK starting with "${prefix}#"\n`);

  const items = await getItemsByEntityType(`${prefix}#`);

  if (items.length === 0) {
    console.log('No items found.\n');
    return;
  }

  const allKeys = new Set<string>();
  for (const item of items) {
    Object.keys(item).forEach((k) => allKeys.add(k));
  }

  const priorityKeys = ['PK', 'SK'];
  const otherKeys = [...allKeys]
    .filter((k) => !priorityKeys.includes(k) && !k.startsWith('GSI'))
    .sort();
  const orderedKeys = [...priorityKeys.filter((k) => allKeys.has(k)), ...otherKeys];
  const displayKeys = orderedKeys.slice(0, 10);

  const table = new Table({
    head: displayKeys,
    wordWrap: true,
  });

  for (const item of items) {
    table.push(displayKeys.map((k) => truncate(formatValue(item[k]), 25)));
  }

  console.log(table.toString());
  console.log(`\nTotal: ${items.length} items\n`);
}

async function executeCommand(cmd: string): Promise<boolean> {
  const parts = cmd.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const arg = parts[1];

  if (!command) return true;

  try {
    switch (command) {
      case 'help':
      case '?':
        showHelp();
        break;

      case 'status':
        console.log('\n📊 Migration Status\n');
        runCliCommand('yarn migrate:status');
        break;

      case 'up':
        if (arg) {
          const steps = parseInt(arg, 10);
          if (isNaN(steps) || steps < 1) {
            console.log(chalk.red('Invalid number of steps'));
            break;
          }
          console.log(`\n🚀 Running up to ${steps} migration(s)...\n`);
          runCliCommand(`yarn migrate:up --limit ${steps}`);
        } else {
          console.log('\n🚀 Running all pending migrations...\n');
          runCliCommand('yarn migrate:up');
        }
        break;

      case 'down':
        if (arg === 'all') {
          console.log('\n⬇️  Rolling back ALL migrations...\n');
          runCliCommand('yarn migrate:down --steps 999');
        } else if (arg) {
          const steps = parseInt(arg, 10);
          if (isNaN(steps) || steps < 1) {
            console.log(chalk.red('Invalid number of steps'));
            break;
          }
          console.log(`\n⬇️  Rolling back ${steps} migration(s)...\n`);
          runCliCommand(`yarn migrate:down --steps ${steps}`);
        } else {
          console.log('\n⬇️  Rolling back last migration...\n');
          runCliCommand('yarn migrate:down --steps 1');
        }
        break;

      case 'create':
        if (!arg) {
          console.log(chalk.red('Usage: create <migration_name>'));
          break;
        }
        if (!/^[a-z][a-z0-9_]*$/.test(arg)) {
          console.log(chalk.red('Use snake_case (lowercase letters, numbers, underscores)'));
          break;
        }
        runCliCommand(`yarn migrate:create ${arg}`);
        break;

      case 'info':
        await showTableInfo();
        break;

      case 'data':
        if (arg) {
          await showDataByEntity(arg);
        } else {
          await showAllData();
        }
        break;

      case 'seed':
        await seedData();
        break;

      case 'clear':
        const confirmInput = await input({
          message: 'Type "yes" to confirm deletion of ALL data:',
        });
        if (confirmInput.toLowerCase() === 'yes') {
          await clearAllData();
        } else {
          console.log(chalk.yellow('Cancelled'));
        }
        break;

      case 'snapshot':
        await showSnapshot();
        break;

      case 'compare':
        await compareSnapshots();
        break;

      case 'exit':
      case 'quit':
      case 'q':
        console.log(chalk.gray('\nBye!\n'));
        return false;

      default:
        console.log(chalk.red(`Unknown command: ${command}`));
        console.log(chalk.gray('Type "help" for available commands'));
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      return true;
    }
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  }

  return true;
}

async function main() {
  console.log(`
${chalk.bold.blue('╔════════════════════════════════════════╗')}
${chalk.bold.blue('║')}  ${chalk.bold('Migrations Playground - REPL Mode')}    ${chalk.bold.blue('║')}
${chalk.bold.blue('║')}  ${chalk.gray('Type commands directly')}               ${chalk.bold.blue('║')}
${chalk.bold.blue('╚════════════════════════════════════════╝')}

Type ${chalk.yellow('help')} for available commands
`);

  let running = true;

  while (running) {
    try {
      const cmd = await input({
        message: chalk.green('migrate>'),
      });
      running = await executeCommand(cmd);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log(chalk.gray('\n\nBye!\n'));
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
