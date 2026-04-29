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

Creates: `migrations/0.1.0_add_user_email.ts`

### 5. Edit the migration

```typescript
import { Migration } from '@ftschopp/dynatable-migrations';

export const migration: Migration = {
  version: '0.1.0',
  name: 'add_user_email',

  async up(context) {
    const { client, tableName, dynamodb } = context;
    // Your migration code here
  },

  async down(context) {
    const { client, tableName, dynamodb } = context;
    // Rollback code here
  },
};
```

### 6. Run migrations

```bash
# Check status first
npx dynatable-migrate status

# Preview changes (dry run)
npx dynatable-migrate up --dry-run

# Apply all pending migrations
npx dynatable-migrate up

# Rollback last migration
npx dynatable-migrate down
```

## Common Migration Patterns

### Pattern 1: Add Field to Existing Items

```typescript
export const migration: Migration = {
  version: '0.1.0',
  name: 'add_user_bio',

  async up(context) {
    const { client, tableName, dynamodb } = context;
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

### Pattern 2: Transform Data

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
    console.log('Cannot revert username normalization - data transformation is one-way');
  },
};
```

### Pattern 3: Change Key Structure (Advanced)

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

  async down(context) {
    // Similar logic but reverse the SK transformation
  },
};
```

### Pattern 4: Add New Entity Type (Schema Documentation Only)

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
        notificationId: { type: 'string', generate: 'ulid' },
        message: { type: 'string', required: true },
        read: { type: 'boolean', default: false },
      },
    },
  },

  async up(context) {
    // In Single Table Design, adding a new entity type
    // doesn't require data migration, just schema documentation
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

### Pattern 5: Batch Processing with Pagination

```typescript
export const migration: Migration = {
  version: '0.5.0',
  name: 'add_timestamps_to_all_items',

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
          Limit: 100, // Process in batches
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

    console.log(`Migration complete. Total items updated: ${totalProcessed}`);
  },

  async down(context) {
    // Removing timestamps is usually not needed, but here's how:
    const { client, tableName, dynamodb } = context;
    const { ScanCommand, UpdateCommand } = dynamodb;

    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const result = await client.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      for (const item of result.Items || []) {
        if (item.PK?.startsWith('_SCHEMA#')) continue;

        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: 'REMOVE #createdAt, #updatedAt',
            ExpressionAttributeNames: {
              '#createdAt': 'createdAt',
              '#updatedAt': 'updatedAt',
            },
          })
        );
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
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
- `-t, --type <type>` - Version bump type: `major`, `minor`, or `patch` (default: patch)
- `-e, --explicit <version>` - Explicit semver version (e.g., 2.0.0)

**Examples:**

```bash
# Create with patch bump (default): 0.1.0 -> 0.1.1
dynatable-migrate create fix_typo

# Create with minor bump: 0.1.1 -> 0.2.0
dynatable-migrate create add_notifications --type minor

# Create with major bump: 0.2.0 -> 1.0.0
dynatable-migrate create breaking_change --type major

# Create with explicit version
dynatable-migrate create hotfix --explicit 0.1.2
```

### `dynatable-migrate up`

Run all pending migrations.

**Options:**

- `-c, --config <path>` - Custom config file path
- `-l, --limit <number>` - Limit migrations to run
- `-d, --dry-run` - Preview changes without applying them

**Examples:**

```bash
# Run all pending
dynatable-migrate up

# Preview what would run
dynatable-migrate up --dry-run

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
- `-d, --dry-run` - Preview changes without applying them

**Examples:**

```bash
# Rollback last migration
dynatable-migrate down

# Preview rollback
dynatable-migrate down --dry-run

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

Table: MyApp
Current version: 0.2.0
Migrations directory: ./migrations

✅ Applied (2):
   0.1.0 - add_user_email (2025-03-29 10:00:00)
   0.2.0 - normalize_usernames (2025-03-29 11:00:00)

⏳ Pending (1):
   0.3.0 - change_photo_sort_key

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

### 3. Use Dry Run Mode

Always preview changes before applying them:

```bash
dynatable-migrate up --dry-run
```

### 4. Backup Before Running

Enable point-in-time recovery on your production tables.

### 5. Keep Migrations Focused

One migration = one change. Don't combine multiple unrelated changes.

### 6. Never Modify Applied Migrations

Once a migration is applied, don't change it. Create a new migration instead.

### 7. Use Transactions for Atomic Operations

For multi-step changes that must succeed or fail together:

```typescript
await client.send(
  new context.dynamodb.TransactWriteCommand({
    TransactItems: [{ Put: { ... } }, { Update: { ... } }, { Delete: { ... } }],
  })
);
```

### 8. Handle Large Datasets Carefully

For tables with many items:

- Process in batches with pagination
- Add delays between batches to avoid throttling
- Consider using DynamoDB Streams for background processing

### 9. Use Semantic Versioning

- **Major** (1.0.0): Breaking schema changes
- **Minor** (0.1.0): New features, new entity types
- **Patch** (0.0.1): Bug fixes, small adjustments

### 10. Document Your Changes

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

- Migration file follows naming convention: `0.1.0_name.ts`
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

### Lock Acquisition Failed

If you see "Could not acquire migration lock":

- Another migration may be running
- Wait a few minutes (lock expires after 5 minutes)
- Check if any stuck processes are running

## Advanced: Programmatic Usage

You can also use the migration runner in your code:

```typescript
import { MigrationRunner, loadConfig, createDynamoDBClient } from '@ftschopp/dynatable-migrations';

async function runMigrations() {
  const config = await loadConfig();
  const client = createDynamoDBClient(config);
  const runner = new MigrationRunner(client, config);

  // Get status
  const status = await runner.status();
  console.log('Migration status:', status);

  // Preview migrations (dry run)
  await runner.up({ dryRun: true });

  // Run migrations
  await runner.up();

  // Run with limit
  await runner.up({ limit: 1 });

  // Rollback
  await runner.down({ steps: 1 });
}
```
