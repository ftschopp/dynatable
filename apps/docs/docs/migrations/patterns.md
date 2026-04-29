---
sidebar_position: 4
title: Migration Patterns
---

# Migration Patterns

Common patterns for DynamoDB migrations in single table design.

## Pattern 1: Add Field to Existing Items

Add a new field with a default value to all items of a specific type.

```typescript
export const migration: Migration = {
  version: '0.1.0',
  name: 'add_user_bio',

  async up(context) {
    const { client, tableName, dynamodb } = context;
    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk)',
        ExpressionAttributeValues: { ':pk': 'USER#' },
      })
    );

    for (const user of result.Items || []) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: 'SET bio = :bio',
          ExpressionAttributeValues: { ':bio': '' },
        })
      );
    }
  },

  async down(context) {
    const { client, tableName, dynamodb } = context;
    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk)',
        ExpressionAttributeValues: { ':pk': 'USER#' },
      })
    );

    for (const user of result.Items || []) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: 'REMOVE bio',
        })
      );
    }
  },
};
```

## Pattern 2: Transform Data

Transform existing data to a new format.

```typescript
export const migration: Migration = {
  version: '0.2.0',
  name: 'normalize_usernames',

  async up(context) {
    const { client, tableName, dynamodb } = context;
    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk)',
        ExpressionAttributeValues: { ':pk': 'USER#' },
      })
    );

    for (const user of result.Items || []) {
      const normalizedUsername = user.username.toLowerCase();

      if (user.username !== normalizedUsername) {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: user.PK, SK: user.SK },
            UpdateExpression: 'SET username = :username',
            ExpressionAttributeValues: { ':username': normalizedUsername },
          })
        );
      }
    }
  },

  async down(context) {
    // One-way transformation - cannot be reversed
    console.log('Cannot revert username normalization');
  },
};
```

## Pattern 3: Change Key Structure

Change the sort key format (requires delete + put).

```typescript
export const migration: Migration = {
  version: '0.3.0',
  name: 'change_photo_sort_key',

  async up(context) {
    const { client, tableName, dynamodb } = context;
    const { ScanCommand, TransactWriteCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':sk': 'PHOTO#' },
      })
    );

    // Process in batches (DynamoDB transaction limit is 100 items)
    const batchSize = 25;
    const items = result.Items || [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const transactItems = [];

      for (const photo of batch) {
        const timestamp = new Date(photo.createdAt).getTime();
        const photoId = photo.SK.replace('PHOTO#', '');

        transactItems.push(
          {
            Delete: {
              TableName: tableName,
              Key: { PK: photo.PK, SK: photo.SK },
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: {
                ...photo,
                SK: `PHOTO#${timestamp}#${photoId}`,
              },
            },
          }
        );
      }

      await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
    }
  },

  async down(context) {
    // Similar logic but reverse the transformation
  },
};
```

## Pattern 4: Add New Entity Type

Document schema additions without data migration.

```typescript
export const migration: Migration = {
  version: '0.4.0',
  name: 'add_notification_entity',

  schema: {
    Notification: {
      key: {
        PK: 'USER#${userId}',
        SK: 'NOTIFICATION#${notificationId}',
      },
      attributes: {
        userId: { type: 'string', required: true },
        notificationId: { type: 'string' },
        message: { type: 'string', required: true },
        read: { type: 'boolean', default: false },
      },
    },
  },

  async up(context) {
    // Document the schema change
    await context.tracker.recordSchemaChange({
      entity: 'Notification',
      changes: {
        added: ['userId', 'notificationId', 'message', 'read'],
      },
    });

    console.log('Notification entity added to schema');
  },

  async down(context) {
    const { client, tableName, dynamodb } = context;
    const { ScanCommand, DeleteCommand } = dynamodb;

    // Delete all notifications if rolling back
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':sk': 'NOTIFICATION#' },
      })
    );

    for (const item of result.Items || []) {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK: item.PK, SK: item.SK },
        })
      );
    }
  },
};
```

## Pattern 5: Batch Processing with Pagination

Handle large tables that exceed scan limits.

```typescript
export const migration: Migration = {
  version: '0.5.0',
  name: 'add_timestamps',

  async up(context) {
    const { client, tableName, dynamodb } = context;
    const { ScanCommand, UpdateCommand } = dynamodb;

    let lastEvaluatedKey: Record<string, any> | undefined;
    let totalProcessed = 0;

    do {
      const result = await client.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: lastEvaluatedKey,
          Limit: 100,
        })
      );

      for (const item of result.Items || []) {
        // Skip schema tracking items
        if (item.PK?.startsWith('_SCHEMA#')) continue;

        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: 'SET #createdAt = if_not_exists(#createdAt, :now), #updatedAt = :now',
            ExpressionAttributeNames: {
              '#createdAt': 'createdAt',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':now': new Date().toISOString(),
            },
          })
        );
        totalProcessed++;
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
      console.log(`Processed ${totalProcessed} items...`);
    } while (lastEvaluatedKey);

    console.log(`Migration complete. Total: ${totalProcessed}`);
  },

  async down(context) {
    // Similar pagination for rollback
  },
};
```

## Best Practices

### 1. Always Write Down Functions

Even for one-way transformations, document what would need to be done:

```typescript
async down(context) {
  console.log('This migration cannot be automatically reversed.');
  console.log('Manual steps required: ...');
}
```

### 2. Use Dry Run Mode

Always preview changes before applying:

```bash
dynatable-migrate up --dry-run
```

### 3. Test Locally First

Use DynamoDB Local for testing:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

### 4. Keep Migrations Focused

One migration = one logical change. Don't combine unrelated changes.

### 5. Use Transactions for Atomic Operations

When multiple items must change together:

```typescript
await client.send(
  new dynamodb.TransactWriteCommand({
    TransactItems: [
      { Put: { ... } },
      { Update: { ... } },
      { Delete: { ... } },
    ],
  })
);
```

### 6. Handle Rate Limiting

For large tables, add delays between batches:

```typescript
for (const batch of batches) {
  await processBatch(batch);
  await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
}
```

### 7. Never Modify Applied Migrations

Once a migration is applied, create a new migration for fixes instead of modifying the original.

## Troubleshooting

### Lock Acquisition Failed

If you see "Could not acquire migration lock":

- Another migration may be running
- Wait a few minutes (lock expires after 5 minutes)
- Check for stuck processes

### Migration Failed Mid-Execution

1. Check the error message
2. Fix the issue manually if needed
3. The migration is marked as "failed"
4. Create a fix migration or manually update the status
