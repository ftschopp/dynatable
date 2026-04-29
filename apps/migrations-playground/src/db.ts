import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = 'MigrationsPlayground';

const ddbClient = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8100',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
});

export const client = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

export const rawClient = ddbClient;
export const tableName = TABLE_NAME;

export interface TableInfo {
  exists: boolean;
  itemCount?: number;
  tableSizeBytes?: number;
  keySchema?: Array<{ AttributeName: string; KeyType: string }>;
  gsiCount?: number;
  lsiCount?: number;
}

export async function getTableInfo(): Promise<TableInfo> {
  try {
    const result = await rawClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));

    return {
      exists: true,
      itemCount: result.Table?.ItemCount,
      tableSizeBytes: result.Table?.TableSizeBytes,
      keySchema: result.Table?.KeySchema as TableInfo['keySchema'],
      gsiCount: result.Table?.GlobalSecondaryIndexes?.length || 0,
      lsiCount: result.Table?.LocalSecondaryIndexes?.length || 0,
    };
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return { exists: false };
    }
    throw error;
  }
}

export async function scanAllItems(): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: lastKey,
      })
    );

    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

export async function queryByPK(pk: string): Promise<Record<string, any>[]> {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
    })
  );

  return result.Items || [];
}

export async function getItemsByEntityType(entityPrefix: string): Promise<Record<string, any>[]> {
  const result = await client.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(PK, :prefix)',
      ExpressionAttributeValues: { ':prefix': entityPrefix },
    })
  );

  return result.Items || [];
}
