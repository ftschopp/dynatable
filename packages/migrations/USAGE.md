# Usage Guide - @ftschopp/dynatable-migrations

## Quick Start Guide

### 1. Install in your project

```bash
npm install @ftschopp/dynatable-migrations
# or
yarn add @ftschopp/dynatable-migrations
```

### 2. Initialize migrations

```bash
npx dynatable-migrate init
```

This creates:

- `migrations/` directory
- `dynatable.config.js` configuration file

### 3. Configure DynamoDB connection

Edit `dynatable.config.js`:

**For Local DynamoDB:**

```javascript
module.exports = {
  tableName: 'MyTable',
  client: {
    region: 'us-east-1',
    endpoint: 'http://localhost:8000',
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
  },
};
```

**For AWS DynamoDB:**

```javascript
module.exports = {
  tableName: 'MyTable',
  client: {
    region: 'us-east-1',
    // Uses AWS_PROFILE or IAM role automatically
  },
};
```

### 4. Create your first migration

```bash
npx dynatable-migrate create add_user_email
```

Creates: `migrations/v0001_add_user_email.ts`

### 5. Edit the migration

```typescript
import { Migration } from '@ftschopp/dynatable-migrations';

export const migration: Migration = {
  version: 'v0001',
  name: 'add_user_email',

  async up({ client, tableName, tracker }) {
    // Your migration code here
  },

  async down({ client, tableName, dynamodb }) {
    // Rollback code here
  },
};
```

### 6. Run migrations

```bash
# Check status first
npx dynatable-migrate status

# Apply all pending migrations
npx dynatable-migrate up

# Rollback last migration
npx dynatable-migrate down
```

## Common Migration Patterns

### Pattern 1: Add Field to Existing Items

```typescript
export const migration: Migration = {
  version: 'v0001',
  name: 'add_user_bio',

  async up({ client, tableName }) {
    const { ScanCommand, UpdateCommand } = dynamodb;

    // Find all users
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk)',
        ExpressionAttributeValues: { ':pk': 'USER#' },
      })
    );

    // Add bio field with default value
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

  async down({ client, tableName, dynamodb }) {
    // Remove the field
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

### Pattern 2: Transform Data

```typescript
export const migration: Migration = {
  version: 'v0002',
  name: 'normalize_usernames',

  async up({ client, tableName }) {
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

  async down({ client, tableName, dynamodb }) {
    console.log('Cannot revert username normalization');
  },
};
```

### Pattern 3: Change Key Structure (Advanced)

```typescript
export const migration: Migration = {
  version: 'v0003',
  name: 'change_photo_sort_key',

  async up({ client, tableName }) {
    const { ScanCommand, TransactWriteCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':sk': 'PHOTO#' },
      })
    );

    // Batch process to avoid rate limits
    const batchSize = 25; // DynamoDB transaction limit
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

      await client.send(
        new TransactWriteCommand({
          TransactItems: transactItems,
        })
      );
    }
  },

  async down({ client, tableName, dynamodb }) {
    // Similar logic but reverse
  },
};
```

### Pattern 4: Add New Entity Type (No Data Migration)

```typescript
export const migration: Migration = {
  version: 'v0004',
  name: 'add_notification_entity',

  schema: {
    Notification: {
      key: {
        PK: 'USER#${userId}',
        SK: 'NOTIFICATION#${notificationId}',
      },
      attributes: {
        userId: { type: String, required: true },
        notificationId: { type: String, generate: 'ulid' },
        message: { type: String, required: true },
        read: { type: Boolean, default: false },
      },
    },
  },

  async up({ tracker }) {
    // In Single Table Design, adding a new entity type
    // doesn't require data migration, just schema documentation
    await tracker.recordSchemaChange({
      entity: 'Notification',
      changes: {
        added: ['userId', 'notificationId', 'message', 'read'],
      },
    });

    console.log('✅ Notification entity added to schema');
  },

  async down({ client, tableName, dynamodb }) {
    // Delete all notifications if rolling back
    const { ScanCommand, DeleteCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':sk': 'NOTIFICATION#' },
      })
    );

    for (const notification of result.Items || []) {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK: notification.PK, SK: notification.SK },
        })
      );
    }
  },
};
```

## CLI Commands Reference

### `dynatable-migrate init`

Initialize migrations in current project.

### `dynatable-migrate create <name>`

Create a new migration file.

**Options:**

- `-c, --config <path>` - Custom config file path

**Example:**

```bash
dynatable-migrate create add_user_profile
```

### `dynatable-migrate up`

Run all pending migrations.

**Options:**

- `-c, --config <path>` - Custom config file path
- `-l, --limit <number>` - Limit migrations to run

**Examples:**

```bash
# Run all pending
dynatable-migrate up

# Run only next migration
dynatable-migrate up --limit 1

# Use custom config
dynatable-migrate up --config ./my-config.js
```

### `dynatable-migrate down`

Rollback migrations.

**Options:**

- `-c, --config <path>` - Custom config file path
- `-s, --steps <number>` - Number of migrations to rollback (default: 1)

**Examples:**

```bash
# Rollback last migration
dynatable-migrate down

# Rollback last 3 migrations
dynatable-migrate down --steps 3
```

### `dynatable-migrate status`

Show migration status.

**Example:**

```bash
dynatable-migrate status
```

**Output:**

```
📊 Migration Status

Table: InstagramClone
Current version: v0002
Migrations directory: ./migrations

✅ Applied (2):
   v0001 - add_user_email (2025-03-29 10:00:00)
   v0002 - normalize_usernames (2025-03-29 11:00:00)

⏳ Pending (1):
   v0003 - change_photo_sort_key

Total: 3 migration(s)
```

## Integration with package.json

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "migrate": "dynatable-migrate",
    "migrate:create": "dynatable-migrate create",
    "migrate:up": "dynatable-migrate up",
    "migrate:down": "dynatable-migrate down",
    "migrate:status": "dynatable-migrate status"
  }
}
```

Then use:

```bash
npm run migrate:status
npm run migrate:create add_feature
npm run migrate:up
npm run migrate:down
```

## Best Practices

### 1. Always Write Down Functions

Even if you think you won't need to rollback, always implement the `down()` function.

### 2. Test Locally First

Use DynamoDB Local to test migrations before running on production:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

### 3. Backup Before Running

Enable point-in-time recovery on your production tables.

### 4. Keep Migrations Focused

One migration = one change. Don't combine multiple unrelated changes.

### 5. Never Modify Applied Migrations

Once a migration is applied, don't change it. Create a new migration instead.

### 6. Use Transactions for Atomic Operations

For multi-step changes that must succeed or fail together:

```typescript
await client.send(new TransactWriteCommand({
  TransactItems: [
    { Put: { ... } },
    { Update: { ... } },
    { Delete: { ... } }
  ]
}));
```

### 7. Handle Large Datasets Carefully

For tables with many items:

- Process in batches
- Add delays between batches to avoid throttling
- Consider using DynamoDB Streams for background processing

### 8. Document Your Changes

Use the `schema` field to document what changed:

```typescript
export const migration: Migration = {
  schema: {
    User: {
      attributes: {
        // ... document your schema here
      },
    },
  },
  // ...
};
```

## Troubleshooting

### Migration Failed Mid-Execution

If a migration fails partway through:

1. Check the error message
2. Fix the issue manually in DynamoDB if needed
3. Fix the migration code
4. The migration will be marked as "failed" - you may need to manually update the status or create a fix migration

### Can't Find Migration File

Make sure:

- Migration file follows naming convention: `v0001_name.ts`
- File is in the `migrationsDir` specified in config
- File exports a `migration` object

### Permission Errors

Ensure your AWS credentials have permissions for:

- `dynamodb:Scan`
- `dynamodb:Query`
- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`

## Advanced: Programmatic Usage

You can also use the migration runner in your code:

```typescript
import { MigrationRunner, loadConfig } from '@ftschopp/dynatable-migrations';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

async function runMigrations() {
  const config = await loadConfig();

  const ddbClient = new DynamoDBClient({
    region: config.client.region,
    endpoint: config.client.endpoint,
  });

  const client = DynamoDBDocumentClient.from(ddbClient);
  const runner = new MigrationRunner(client, config);

  // Get status
  const status = await runner.status();
  console.log('Migration status:', status);

  // Run migrations
  await runner.up();

  // Rollback
  await runner.down(1);
}
```
