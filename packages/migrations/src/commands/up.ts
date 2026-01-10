import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { MigrationRunner } from '../core/runner';
import { MigrationConfig } from '../types';

export async function runMigrations(config: MigrationConfig, limit?: number): Promise<void> {
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
    const executed = await runner.up(limit);

    if (executed.length > 0) {
      console.log(`\n🎉 Successfully applied ${executed.length} migration(s)`);

      const currentVersion = await runner.getCurrentVersion();
      console.log(`📌 Current version: ${currentVersion}\n`);
    }
  } catch (error: any) {
    console.error(`\n❌ Migration failed: ${error.message}\n`);
    process.exit(1);
  }
}
