import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
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

async function testTimestamps() {
  const now = new Date().toISOString();

  // Put item
  await client.send(
    new PutCommand({
      TableName: 'InstagramClone',
      Item: {
        PK: 'TEST#timestamp',
        SK: 'TEST#timestamp',
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  console.log('✅ Stored timestamp:', now);
  console.log('Type:', typeof now);

  // Get item back
  const result = await client.send(
    new GetCommand({
      TableName: 'InstagramClone',
      Key: {
        PK: 'TEST#timestamp',
        SK: 'TEST#timestamp',
      },
    })
  );

  console.log('\n✅ Retrieved item:');
  console.log('createdAt value:', result.Item?.createdAt);
  console.log('createdAt type:', typeof result.Item?.createdAt);
  console.log('updatedAt value:', result.Item?.updatedAt);
  console.log('updatedAt type:', typeof result.Item?.updatedAt);
}

testTimestamps().catch(console.error);
