import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { MigrationConfig } from '../types';

/**
 * Create a DynamoDB Document Client from config
 */
export function createDynamoDBClient(config: MigrationConfig): DynamoDBDocumentClient {
  const ddbClient = new DynamoDBClient({
    region: config.client.region,
    endpoint: config.client.endpoint,
    credentials: config.client.credentials,
  });

  return DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  });
}
