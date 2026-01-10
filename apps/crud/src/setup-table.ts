import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

/**
 * Script para crear la tabla en DynamoDB Local
 * Ejecutar con: npm run setup:table
 */

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
});

async function deleteTableIfExists(tableName: string) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`📋 Table ${tableName} exists, deleting...`);
    await client.send(new DeleteTableCommand({ TableName: tableName }));
    console.log(`✅ Table ${tableName} deleted`);
    // Wait a bit for DynamoDB to process the deletion
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`📋 Table ${tableName} does not exist, creating new...`);
    } else {
      throw error;
    }
  }
}

async function createTable() {
  const tableName = 'InstagramClone';

  // Eliminar tabla si existe
  await deleteTableIfExists(tableName);

  // Crear tabla
  const command = new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    ],
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  });

  try {
    const response = await client.send(command);
    console.log('✅ Table created successfully!');
    console.log(`📊 Table Status: ${response.TableDescription?.TableStatus}`);
    console.log(`\n🚀 You can now run: npm run dev\n`);
  } catch (error) {
    console.error('❌ Error creating table:', error);
    process.exit(1);
  }
}

createTable();
