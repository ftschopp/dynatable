# @ftschopp/dynatable-migrations

DynamoDB migration tool for single table design with schema versioning.

## Features

- **Single Table Design** - Built specifically for DynamoDB single table design patterns
- **Semantic Versioning** - Migrations use semver (0.1.0, 0.2.0, 1.0.0) for clear version tracking
- **Up/Down Migrations** - Support for both applying and rolling back migrations
- **Migration History** - All migration records stored in your DynamoDB table using Single Table Design
- **Distributed Locking** - Prevents concurrent migrations with automatic lock expiration
- **Dry Run Mode** - Preview changes before applying them
- **TypeScript First** - Full TypeScript support with type safety
- **CLI Tool** - Easy-to-use command-line interface

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
# Create with auto-incremented patch version (default)
npx dynatable-migrate create add_user_email

# Create with specific bump type
npx dynatable-migrate create add_feature --type minor
npx dynatable-migrate create breaking_change --type major

# Create with explicit version
npx dynatable-migrate create custom_version --explicit 2.0.0
```

This creates a file like `migrations/0.1.0_add_user_email.ts`

### 4. Edit Migration

```typescript
import { Migration } from '@ftschopp/dynatable-migrations';

export const migration: Migration = {
  version: '0.1.0',
  name: 'add_user_email',
  description: 'Add email field to User entity',

  async up(context) {
    const { client, tableName, dynamodb } = context;
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
# Check status
npx dynatable-migrate status

# Preview changes (dry run)
npx dynatable-migrate up --dry-run

# Apply all pending migrations
npx dynatable-migrate up

# Apply only 1 migration
npx dynatable-migrate up --limit 1

# Rollback last migration
npx dynatable-migrate down

# Rollback last 2 migrations
npx dynatable-migrate down --steps 2

# Preview rollback
npx dynatable-migrate down --dry-run
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
- `-t, --type <type>` - Version bump type: `major`, `minor`, or `patch` (default: patch)
- `-e, --explicit <version>` - Explicit version (e.g., 2.0.0)

Examples:

```bash
# Patch bump: 0.1.0 -> 0.1.1
dynatable-migrate create fix_typo

# Minor bump: 0.1.1 -> 0.2.0
dynatable-migrate create add_notifications --type minor

# Major bump: 0.2.0 -> 1.0.0
dynatable-migrate create breaking_schema_change --type major

# Explicit version
dynatable-migrate create hotfix --explicit 0.1.2
```

### `up`

Run pending migrations.

```bash
dynatable-migrate up
```

Options:

- `-c, --config <path>` - Custom config file path
- `-l, --limit <number>` - Limit number of migrations to run
- `-d, --dry-run` - Preview what would be done without making changes

### `down`

Rollback migrations.

```bash
dynatable-migrate down
```

Options:

- `-c, --config <path>` - Custom config file path
- `-s, --steps <number>` - Number of migrations to rollback (default: 1)
- `-d, --dry-run` - Preview what would be done without making changes

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
_SCHEMA#VERSION         0.1.0             0.1.0    applied    2025-03-29T10:00:00Z
_SCHEMA#VERSION         0.2.0             0.2.0    applied    2025-03-29T11:00:00Z
_SCHEMA#VERSION#CURRENT _SCHEMA#VERSION   0.2.0    -          2025-03-29T11:00:00Z
```

### Migration Context

Every migration receives a context object with:

```typescript
interface MigrationContext {
  client: DynamoDBDocumentClient; // AWS SDK client
  tableName: string; // Your table name
  tracker: MigrationTracker; // Track schema changes
  config: MigrationConfig; // Your config
  dynamodb: DynamoDBCommands; // Pre-imported DynamoDB commands
}
```

The `dynamodb` object includes all common commands:

- `ScanCommand`, `QueryCommand`
- `GetCommand`, `PutCommand`, `UpdateCommand`, `DeleteCommand`
- `BatchGetCommand`, `BatchWriteCommand`
- `TransactWriteCommand`, `TransactGetCommand`

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

  // Optional: GSI name for queries (default: GSI1)
  gsi1Name?: string;
}
```

## Programmatic Usage

You can also use the migration runner programmatically:

```typescript
import { MigrationRunner, loadConfig, createDynamoDBClient } from '@ftschopp/dynatable-migrations';

const config = await loadConfig();
const client = createDynamoDBClient(config);

const runner = new MigrationRunner(client, config);

// Run migrations
await runner.up();

// Run with options
await runner.up({ limit: 1, dryRun: true });

// Get status
const status = await runner.status();

// Rollback
await runner.down({ steps: 1 });
```

### Available Exports

```typescript
// Core classes
export { MigrationRunner } from './core/runner';
export { MigrationLoader } from './core/loader';
export { DynamoDBMigrationTracker } from './core/tracker';

// Config
export { loadConfig, ConfigLoader } from './core/config';
export { createDynamoDBClient } from './core/client';

// Commands (for programmatic use)
export { createMigration } from './commands/create';
export { runMigrations } from './commands/up';
export { rollbackMigrations } from './commands/down';
export { showStatus } from './commands/status';
export { initProject } from './commands/init';

// Types
export * from './types';
```

## Best Practices

1. **Always write down() functions** - Even if you think you won't need to rollback
2. **Test migrations locally first** - Use DynamoDB Local
3. **Use dry-run mode** - Preview changes before applying: `dynatable-migrate up --dry-run`
4. **Backup before running** - Use DynamoDB point-in-time recovery
5. **One change per migration** - Keep migrations focused
6. **Don't modify applied migrations** - Create a new migration instead
7. **Use transactions** - For multi-step changes that must be atomic
8. **Use semantic versioning** - major for breaking changes, minor for features, patch for fixes

## License

MIT
