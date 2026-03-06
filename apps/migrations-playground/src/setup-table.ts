import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';

const TABLE_NAME = 'MigrationsPlayground';

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8100',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
});

async function tableExists(): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable(): Promise<void> {
  console.log(`\nCreating table: ${TABLE_NAME}...\n`);

  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
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
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      })
    );

    console.log(`Table ${TABLE_NAME} created successfully!`);
    console.log('\nTable structure:');
    console.log('  - Primary Key: PK (HASH) + SK (RANGE)');
    console.log('  - GSI1: GSI1PK (HASH) + GSI1SK (RANGE)');
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`Table ${TABLE_NAME} already exists.`);
    } else {
      throw error;
    }
  }
}

async function main() {
  const exists = await tableExists();

  if (exists) {
    console.log(`\nTable ${TABLE_NAME} already exists.`);
    console.log('Use docker:reset to start fresh.\n');
  } else {
    await createTable();
  }
}

main().catch(console.error);
