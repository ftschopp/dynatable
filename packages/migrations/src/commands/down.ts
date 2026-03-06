import { MigrationRunner } from '../core/runner';
import { createDynamoDBClient } from '../core/client';
import { MigrationConfig } from '../types';

export async function rollbackMigrations(
  config: MigrationConfig,
  steps: number = 1,
  dryRun: boolean = false
): Promise<void> {
  const client = createDynamoDBClient(config);
  const runner = new MigrationRunner(client, config);

  try {
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
