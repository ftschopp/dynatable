import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { MigrationRunner } from '../core/runner';
import { MigrationConfig } from '../types';

export async function rollbackMigrations(
  config: MigrationConfig,
  steps: number = 1
): Promise<void> {
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
    const rolledBack = await runner.down(steps);

    if (rolledBack.length > 0) {
      console.log(`\n🎉 Successfully rolled back ${rolledBack.length} migration(s)`);

      const currentVersion = await runner.getCurrentVersion();
      console.log(`📌 Current version: ${currentVersion}\n`);
    }
  } catch (error: any) {
    console.error(`\n❌ Rollback failed: ${error.message}\n`);
    process.exit(1);
  }
}
