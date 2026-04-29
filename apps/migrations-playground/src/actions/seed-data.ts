import { select } from '@inquirer/prompts';
import { BatchWriteCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { client, tableName, scanAllItems } from '../db';

const SAMPLE_USERS = [
  {
    PK: 'USER#alice',
    SK: 'USER#alice',
    GSI1PK: 'USERS',
    GSI1SK: 'USER#alice',
    entityType: 'User',
    username: 'alice',
    name: 'Alice Johnson',
    createdAt: new Date().toISOString(),
  },
  {
    PK: 'USER#bob',
    SK: 'USER#bob',
    GSI1PK: 'USERS',
    GSI1SK: 'USER#bob',
    entityType: 'User',
    username: 'bob',
    name: 'Bob Smith',
    createdAt: new Date().toISOString(),
  },
  {
    PK: 'USER#charlie',
    SK: 'USER#charlie',
    GSI1PK: 'USERS',
    GSI1SK: 'USER#charlie',
    entityType: 'User',
    username: 'charlie',
    name: 'Charlie Brown',
    createdAt: new Date().toISOString(),
  },
];

const SAMPLE_PRODUCTS = [
  {
    PK: 'PRODUCT#prod-001',
    SK: 'PRODUCT#prod-001',
    GSI1PK: 'PRODUCTS',
    GSI1SK: 'PRODUCT#prod-001',
    entityType: 'Product',
    productId: 'prod-001',
    name: 'Laptop Pro',
    price: 1299.99,
    category: 'Electronics',
    stock: 50,
    createdAt: new Date().toISOString(),
  },
  {
    PK: 'PRODUCT#prod-002',
    SK: 'PRODUCT#prod-002',
    GSI1PK: 'PRODUCTS',
    GSI1SK: 'PRODUCT#prod-002',
    entityType: 'Product',
    productId: 'prod-002',
    name: 'Wireless Mouse',
    price: 49.99,
    category: 'Electronics',
    stock: 200,
    createdAt: new Date().toISOString(),
  },
  {
    PK: 'PRODUCT#prod-003',
    SK: 'PRODUCT#prod-003',
    GSI1PK: 'PRODUCTS',
    GSI1SK: 'PRODUCT#prod-003',
    entityType: 'Product',
    productId: 'prod-003',
    name: 'Coffee Mug',
    price: 14.99,
    category: 'Home',
    stock: 500,
    createdAt: new Date().toISOString(),
  },
];

const SAMPLE_ORDERS = [
  {
    PK: 'USER#alice',
    SK: 'ORDER#2024-001',
    GSI1PK: 'ORDERS',
    GSI1SK: '2024-01-15',
    entityType: 'Order',
    orderId: '2024-001',
    username: 'alice',
    total: 1349.98,
    status: 'completed',
    items: [
      { productId: 'prod-001', quantity: 1 },
      { productId: 'prod-002', quantity: 1 },
    ],
    createdAt: '2024-01-15T10:30:00Z',
  },
  {
    PK: 'USER#bob',
    SK: 'ORDER#2024-002',
    GSI1PK: 'ORDERS',
    GSI1SK: '2024-01-16',
    entityType: 'Order',
    orderId: '2024-002',
    username: 'bob',
    total: 29.98,
    status: 'pending',
    items: [{ productId: 'prod-003', quantity: 2 }],
    createdAt: '2024-01-16T14:00:00Z',
  },
];

async function batchWriteItems(items: Record<string, any>[]): Promise<void> {
  // DynamoDB BatchWrite supports max 25 items per request
  const batches = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  for (const batch of batches) {
    let itemsToWrite = batch;
    let retries = 0;
    const maxRetries = 3;

    while (itemsToWrite.length > 0 && retries < maxRetries) {
      const result = await client.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: itemsToWrite.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        })
      );

      // Handle unprocessed items
      const unprocessed = result.UnprocessedItems?.[tableName];
      if (unprocessed && unprocessed.length > 0) {
        itemsToWrite = unprocessed
          .filter((req) => req.PutRequest?.Item)
          .map((req) => req.PutRequest!.Item as Record<string, any>);
        retries++;
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 100));
      } else {
        itemsToWrite = [];
      }
    }

    if (itemsToWrite.length > 0) {
      console.warn(
        `Warning: ${itemsToWrite.length} items could not be written after ${maxRetries} retries`
      );
    }
  }
}

export async function seedData(): Promise<void> {
  const choice = await select({
    message: 'What data do you want to seed?',
    choices: [
      { name: 'All sample data (Users + Products + Orders)', value: 'all' },
      { name: 'Users only (3 users)', value: 'users' },
      { name: 'Products only (3 products)', value: 'products' },
      { name: 'Orders only (2 orders)', value: 'orders' },
    ],
  });

  let items: Record<string, any>[] = [];

  switch (choice) {
    case 'all':
      items = [...SAMPLE_USERS, ...SAMPLE_PRODUCTS, ...SAMPLE_ORDERS];
      break;
    case 'users':
      items = SAMPLE_USERS;
      break;
    case 'products':
      items = SAMPLE_PRODUCTS;
      break;
    case 'orders':
      items = SAMPLE_ORDERS;
      break;
  }

  console.log(`\nSeeding ${items.length} items...\n`);

  await batchWriteItems(items);

  console.log(`✅ Successfully seeded ${items.length} items\n`);

  // Show summary
  const users = items.filter((i) => i.entityType === 'User').length;
  const products = items.filter((i) => i.entityType === 'Product').length;
  const orders = items.filter((i) => i.entityType === 'Order').length;

  if (users) console.log(`   - ${users} Users`);
  if (products) console.log(`   - ${products} Products`);
  if (orders) console.log(`   - ${orders} Orders`);
  console.log('');
}

export async function clearAllData(): Promise<void> {
  console.log('\nClearing all data...\n');

  const items = await scanAllItems();

  if (items.length === 0) {
    console.log('Table is already empty.\n');
    return;
  }

  let deleted = 0;

  for (const item of items) {
    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { PK: item.PK, SK: item.SK },
      })
    );
    deleted++;

    if (deleted % 10 === 0) {
      process.stdout.write(`\rDeleted ${deleted}/${items.length} items...`);
    }
  }

  console.log(`\r✅ Deleted ${deleted} items                    \n`);
}
