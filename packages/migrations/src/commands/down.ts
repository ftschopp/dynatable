import * as readline from 'readline';
import { MigrationRunner } from '../core/runner';
import { createDynamoDBClient } from '../core/client';
import { MigrationConfig } from '../types';

/**
 * Ask the user a yes/no question on stdin. Returns true only on an
 * explicit "y" or "yes" (case-insensitive). Anything else — including
 * EOF on a non-TTY pipe — counts as "no", so misconfigured CI doesn't
 * accidentally roll back production.
 */
async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(prompt, resolve);
    });
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function rollbackMigrations(
  config: MigrationConfig,
  steps: number = 1,
  dryRun: boolean = false,
  yes: boolean = false
): Promise<void> {
  const client = createDynamoDBClient(config);
  const runner = new MigrationRunner(client, config);

  try {
    if (!dryRun && !yes) {
      const ok = await confirm(
        `\n⚠️  About to roll back ${steps} migration(s) on table "${config.tableName}". ` +
          `This will run each migration's down() handler.\nProceed? [y/N] `
      );
      if (!ok) {
        console.log('Aborted. No changes were made.\n');
        return;
      }
    }

    const rolledBack = await runner.down(steps, dryRun);

    if (!dryRun && rolledBack.length > 0) {
      console.log(`\n🎉 Successfully rolled back ${rolledBack.length} migration(s)`);

      const currentVersion = await runner.getCurrentVersion();
      console.log(`📌 Current version: ${currentVersion}\n`);
    }
  } catch (error: any) {
    console.error(`\n❌ Rollback failed: ${error.message}\n`);
    process.exit(1);
  }
}
