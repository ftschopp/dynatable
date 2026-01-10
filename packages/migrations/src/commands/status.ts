import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { MigrationRunner } from '../core/runner';
import { MigrationConfig } from '../types';

export async function showStatus(config: MigrationConfig): Promise<void> {
  // Create DynamoDB client
  const ddbClient = new DynamoDBClient({
    region: config.client.region,
    endpoint: config.client.endpoint,
    credentials: config.client.credentials,
  });

  const client = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  });

  const runner = new MigrationRunner(client, config);

  try {
    const statuses = await runner.status();
    const currentVersion = await runner.getCurrentVersion();

    console.log(`\n📊 Migration Status\n`);
    console.log(`Table: ${config.tableName}`);
    console.log(`Current version: ${currentVersion || 'v0000 (no migrations)'}`);
    console.log(`Migrations directory: ${config.migrationsDir || './migrations'}\n`);

    if (statuses.length === 0) {
      console.log('No migrations found.\n');
      return;
    }

    // Group by status
    const pending = statuses.filter((s) => s.status === 'pending');
    const applied = statuses.filter((s) => s.status === 'applied');
    const failed = statuses.filter((s) => s.status === 'failed');
    const rolledBack = statuses.filter((s) => s.status === 'rolled_back');

    // Show applied migrations
    if (applied.length > 0) {
      console.log(`✅ Applied (${applied.length}):`);
      for (const status of applied) {
        const date = status.appliedAt ? new Date(status.appliedAt).toLocaleString() : '';
        console.log(`   ${status.version} - ${status.name} (${date})`);
      }
      console.log();
    }

    // Show pending migrations
    if (pending.length > 0) {
      console.log(`⏳ Pending (${pending.length}):`);
      for (const status of pending) {
        console.log(`   ${status.version} - ${status.name}`);
      }
      console.log();
    }

    // Show rolled back migrations
    if (rolledBack.length > 0) {
      console.log(`⬅️  Rolled Back (${rolledBack.length}):`);
      for (const status of rolledBack) {
        console.log(`   ${status.version} - ${status.name}`);
      }
      console.log();
    }

    // Show failed migrations
    if (failed.length > 0) {
      console.log(`❌ Failed (${failed.length}):`);
      for (const status of failed) {
        console.log(`   ${status.version} - ${status.name}`);
        if (status.error) {
          console.log(`      Error: ${status.error}`);
        }
      }
      console.log();
    }

    // Summary
    console.log(`Total: ${statuses.length} migration(s)\n`);
  } catch (error: any) {
    console.error(`\n❌ Failed to get status: ${error.message}\n`);
    process.exit(1);
  }
}
