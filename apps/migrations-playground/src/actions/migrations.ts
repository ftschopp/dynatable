import { execSync } from 'child_process';
import { select, input } from '@inquirer/prompts';
import Table from 'cli-table3';
import { queryByPK } from '../db';

export async function showMigrationStatus(): Promise<void> {
  console.log('\n📊 Migration Status\n');

  try {
    // Run the CLI command and capture output
    execSync('yarn migrate:status', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (error: unknown) {
    // Command might exit with non-zero status if no migrations pending
    // Only re-throw if it's an unexpected error (not a normal "no migrations" case)
    if (error instanceof Error && 'status' in error && error.status !== 0) {
      // Status check command completed but with non-zero exit - this is expected
      // when there are no migrations, so we don't re-throw
    } else if (!(error instanceof Error) || !('status' in error)) {
      throw error;
    }
  }

  // Also show raw migration records from DynamoDB
  console.log('\n📋 Raw Migration Records in DynamoDB:\n');

  const records = await queryByPK('_SCHEMA#VERSION');

  if (records.length === 0) {
    console.log('No migration records found.\n');
    return;
  }

  const table = new Table({
    head: ['Version', 'Name', 'Status', 'Applied At'],
    colWidths: [12, 30, 15, 25],
  });

  for (const record of records) {
    table.push([
      record.version || record.SK || '',
      record.name || '',
      record.status || 'applied',
      record.appliedAt || record.timestamp || '',
    ]);
  }

  console.log(table.toString());

  // Show current version pointer
  const currentRecords = await queryByPK('_SCHEMA#VERSION#CURRENT');
  if (currentRecords.length > 0) {
    console.log(`\n📌 Current Version: ${currentRecords[0]?.currentVersion || 'unknown'}\n`);
  }
}

export async function runMigrations(): Promise<void> {
  const limitChoice = await select({
    message: 'How many migrations to run?',
    choices: [
      { name: 'All pending migrations', value: 'all' },
      { name: 'Just one (next pending)', value: '1' },
      { name: 'Specify number', value: 'custom' },
    ],
  });

  let limitArg = '';

  if (limitChoice === '1') {
    limitArg = '--limit 1';
  } else if (limitChoice === 'custom') {
    const num = await input({
      message: 'Number of migrations to run:',
      validate: (v) => {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 1) return 'Enter a positive number';
        return true;
      },
    });
    limitArg = `--limit ${num}`;
  }

  console.log('\n');

  try {
    execSync(`yarn migrate:up ${limitArg}`.trim(), {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch {
    // Migration errors are displayed by the command
  }
}

export async function rollbackMigrations(): Promise<void> {
  const stepsChoice = await select({
    message: 'How many migrations to rollback?',
    choices: [
      { name: 'Just one (last applied)', value: '1' },
      { name: 'Two migrations', value: '2' },
      { name: 'Specify number', value: 'custom' },
      { name: 'All (reset)', value: 'all' },
    ],
  });

  let stepsArg = '--steps 1';

  if (stepsChoice === '2') {
    stepsArg = '--steps 2';
  } else if (stepsChoice === 'custom') {
    const num = await input({
      message: 'Number of migrations to rollback:',
      validate: (v) => {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 1) return 'Enter a positive number';
        return true;
      },
    });
    stepsArg = `--steps ${num}`;
  } else if (stepsChoice === 'all') {
    stepsArg = '--steps 999';
  }

  console.log('\n');

  try {
    execSync(`yarn migrate:down ${stepsArg}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch {
    // Rollback errors are displayed by the command
  }
}
