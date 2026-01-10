# @ftschopp/dynatable-migrations

DynamoDB migration tool for single table design with schema versioning.

## Features

- 🚀 **Single Table Design** - Built specifically for DynamoDB single table design patterns
- 📊 **Schema Versioning** - Track schema evolution over time within your DynamoDB table
- 🔄 **Up/Down Migrations** - Support for both applying and rolling back migrations
- 📝 **Migration History** - All migration records stored in your DynamoDB table using Single Table Design
- 🎯 **TypeScript First** - Full TypeScript support with type safety
- 🛠️ **CLI Tool** - Easy-to-use command-line interface
- 📦 **Zero Dependencies** - Only requires AWS SDK

## Installation

```bash
npm install @ftschopp/dynatable-migrations
# or
yarn add @ftschopp/dynatable-migrations
```

## Quick Start

### 1. Initialize

Create migration structure in your project:

```bash
npx dynatable-migrate init
```

This creates:

- `migrations/` directory for your migration files
- `dynatable.config.js` configuration file

### 2. Configure

Edit `dynatable.config.js`:

```javascript
module.exports = {
  tableName: 'MyTable',
  client: {
    region: 'us-east-1',
    // For local DynamoDB
    endpoint: 'http://localhost:8000',
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
  },
  migrationsDir: './migrations',
};
```

### 3. Create Migration

```bash
npx dynatable-migrate create add_user_email
```

This creates a file like `migrations/v0001_add_user_email.ts`

### 4. Edit Migration

```typescript
import { Migration } from '@ftschopp/dynatable-migrations';

export const migration: Migration = {
  version: 'v0001',
  name: 'add_user_email',
  description: 'Add email field to User entity',

  async up({ client, tableName, dynamodb }) {
    const { ScanCommand, UpdateCommand } = dynamodb;

    // Scan all users
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk)',
        ExpressionAttributeValues: { ':pk': 'USER#' },
      })
    );

    // Add email field to each user
    for (const item of result.Items || []) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: 'SET email = :email, emailVerified = :verified',
          ExpressionAttributeValues: {
            ':email': null,
            ':verified': false,
          },
        })
      );
    }
  },

  async down({ client, tableName, dynamodb }) {
    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk)',
        ExpressionAttributeValues: { ':pk': 'USER#' },
      })
    );

    for (const item of result.Items || []) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: 'REMOVE email, emailVerified',
        })
      );
    }
  },
};
```

### 5. Run Migrations

```bash
# Apply all pending migrations
npx dynatable-migrate up

# Apply only 1 migration
npx dynatable-migrate up --limit 1

# Check status
npx dynatable-migrate status

# Rollback last migration
npx dynatable-migrate down

# Rollback last 2 migrations
npx dynatable-migrate down --steps 2
```

## CLI Commands

### `init`

Initialize migrations in your project.

```bash
dynatable-migrate init
```

### `create <name>`

Create a new migration file.

```bash
dynatable-migrate create add_user_profile
```

Options:

- `-c, --config <path>` - Custom config file path

### `up`

Run pending migrations.

```bash
dynatable-migrate up
```

Options:

- `-c, --config <path>` - Custom config file path
- `-l, --limit <number>` - Limit number of migrations to run

### `down`

Rollback migrations.

```bash
dynatable-migrate down
```

Options:

- `-c, --config <path>` - Custom config file path
- `-s, --steps <number>` - Number of migrations to rollback (default: 1)

### `status`

Show migration status.

```bash
dynatable-migrate status
```

Options:

- `-c, --config <path>` - Custom config file path

## How It Works

### Single Table Design

All migration tracking happens **within your DynamoDB table** using Single Table Design principles:

```
PK                      SK                version  status     appliedAt
-----------------------------------------------------------------------
_SCHEMA#VERSION         v0001             v0001    applied    2025-03-29T10:00:00Z
_SCHEMA#VERSION         v0002             v0002    applied    2025-03-29T11:00:00Z
_SCHEMA#VERSION#CURRENT _SCHEMA#VERSION   v0002    -          2025-03-29T11:00:00Z
```

A GSI (GSI1) is used to quickly find the current version:

```
GSI1PK            GSI1SK
---------------------------
_SCHEMA#CURRENT   v0002
```

### Migration Context

Every migration receives a context object with:

```typescript
interface MigrationContext {
  client: DynamoDBDocumentClient; // AWS SDK client
  tableName: string; // Your table name
  tracker: MigrationTracker; // Track schema changes
  config: MigrationConfig; // Your config
}
```

### Schema Change Tracking

Track what changed in each migration:

```typescript
await tracker.recordSchemaChange({
  entity: 'User',
  changes: {
    added: ['email', 'emailVerified'],
    removed: ['oldField'],
    modified: [{ field: 'status', from: 'string', to: 'enum' }],
  },
});
```

## Migration Examples

### Add New Entity Type

```typescript
export const migration: Migration = {
  version: 'v0003',
  name: 'add_comment_entity',

  async up({ client, tableName }) {
    // In Single Table Design, you typically don't need to do anything
    // Just document the schema change
    console.log('Comment entity added to schema');
  },

  async down({ client, tableName }) {
    // Delete all comments if rolling back
    const { ScanCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb');

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk)',
        ExpressionAttributeValues: { ':pk': 'COMMENT#' },
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

### Change Key Structure

```typescript
export const migration: Migration = {
  version: 'v0004',
  name: 'change_photo_sort_key',

  async up({ client, tableName }) {
    // Change from SK: "PHOTO#${id}" to SK: "PHOTO#${timestamp}#${id}"
    const { ScanCommand, TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb');

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':sk': 'PHOTO#' },
      })
    );

    for (const photo of result.Items || []) {
      const timestamp = new Date(photo.createdAt).getTime();
      const photoId = photo.SK.replace('PHOTO#', '');

      await client.send(
        new TransactWriteCommand({
          TransactItems: [
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
            },
          ],
        })
      );
    }
  },

  async down({ client, tableName }) {
    // Reverse the change
    // ... similar logic but reverse
  },
};
```

## Configuration

### Config File Options

```typescript
interface MigrationConfig {
  // Required: DynamoDB table name
  tableName: string;

  // Required: AWS client config
  client: {
    region: string;
    endpoint?: string; // For local DynamoDB
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  };

  // Optional: Migrations directory (default: ./migrations)
  migrationsDir?: string;

  // Optional: Tracking prefix (default: _SCHEMA#VERSION)
  trackingPrefix?: string;

  // Optional: GSI name (default: GSI1)
  gsi1Name?: string;
}
```

## Programmatic Usage

You can also use the migration runner programmatically:

```typescript
import { MigrationRunner, loadConfig } from '@ftschopp/dynatable-migrations';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const config = await loadConfig();
const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: config.client.region,
    endpoint: config.client.endpoint,
  })
);

const runner = new MigrationRunner(client, config);

// Run migrations
await runner.up();

// Get status
const status = await runner.status();

// Rollback
await runner.down(1);
```

## Best Practices

1. **Always write down() functions** - Even if you think you won't need to rollback
2. **Test migrations locally first** - Use DynamoDB Local
3. **Backup before running** - Use DynamoDB point-in-time recovery
4. **One change per migration** - Keep migrations focused
5. **Don't modify applied migrations** - Create a new migration instead
6. **Use transactions** - For multi-step changes that must be atomic
7. **Document schema changes** - Use the schema snapshot field

## License

MIT
