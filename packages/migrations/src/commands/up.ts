import { MigrationRunner } from '../core/runner';
import { createDynamoDBClient } from '../core/client';
import { MigrationConfig } from '../types';

export async function runMigrations(
  config: MigrationConfig,
  limit?: number,
  dryRun: boolean = false
): Promise<void> {
  const client = createDynamoDBClient(config);
  const runner = new MigrationRunner(client, config);

  try {
    const executed = await runner.up({ limit, dryRun });

    if (!dryRun && executed.length > 0) {
      console.log(`\n🎉 Successfully applied ${executed.length} migration(s)`);

      const currentVersion = await runner.getCurrentVersion();
      console.log(`📌 Current version: ${currentVersion}\n`);
    }
  } catch (error: any) {
    console.error(`\n❌ Migration failed: ${error.message}\n`);
    process.exit(1);
  }
}
