---
sidebar_position: 2
title: Getting Started
---

# Getting Started with Migrations

## Installation

```bash
npm install @ftschopp/dynatable-migrations
# or
yarn add @ftschopp/dynatable-migrations
```

## Initialize

Create migration structure in your project:

```bash
npx dynatable-migrate init
```

This creates:

- `migrations/` directory for your migration files
- `dynatable.config.js` configuration file

## Configure

Edit `dynatable.config.js`:

### For Local DynamoDB

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
  migrationsDir: './migrations',
};
```

### For AWS DynamoDB

```javascript
module.exports = {
  tableName: 'MyTable',
  client: {
    region: 'us-east-1',
    // Uses AWS_PROFILE or IAM role automatically
  },
};
```

### Configuration Options

| Option               | Required | Default           | Description                                     |
| -------------------- | -------- | ----------------- | ----------------------------------------------- |
| `tableName`          | Yes      | -                 | Your DynamoDB table name                        |
| `client.region`      | Yes      | -                 | AWS region                                      |
| `client.endpoint`    | No       | -                 | Custom endpoint (for local DynamoDB)            |
| `client.credentials` | No       | -                 | AWS credentials (uses default chain if omitted) |
| `migrationsDir`      | No       | `./migrations`    | Directory for migration files                   |
| `trackingPrefix`     | No       | `_SCHEMA#VERSION` | PK prefix for tracking records                  |
| `gsi1Name`           | No       | `GSI1`            | Name of your GSI for queries                    |

## Create Your First Migration

```bash
npx dynatable-migrate create add_user_email
```

This creates `migrations/0.1.0_add_user_email.ts`:

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

## Migration Context

Every migration receives a context object:

```typescript
interface MigrationContext {
  client: DynamoDBDocumentClient; // AWS SDK client
  tableName: string; // Your table name
  tracker: MigrationTracker; // Track schema changes
  config: MigrationConfig; // Your config
  dynamodb: DynamoDBCommands; // Pre-imported commands
}
```

The `dynamodb` object includes all common commands:

- `ScanCommand`, `QueryCommand`
- `GetCommand`, `PutCommand`, `UpdateCommand`, `DeleteCommand`
- `BatchGetCommand`, `BatchWriteCommand`
- `TransactWriteCommand`, `TransactGetCommand`

## Run Migrations

```bash
# Check status
npx dynatable-migrate status

# Preview changes (dry run)
npx dynatable-migrate up --dry-run

# Apply all pending migrations
npx dynatable-migrate up

# Apply only 1 migration
npx dynatable-migrate up --limit 1
```

## Rollback

```bash
# Rollback last migration
npx dynatable-migrate down

# Rollback last 2 migrations
npx dynatable-migrate down --steps 2

# Preview rollback
npx dynatable-migrate down --dry-run
```

## Add to package.json

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
```

## Next Steps

- [CLI Reference](./cli-reference.md) - All available commands and options
- [Migration Patterns](./patterns.md) - Common patterns for different scenarios
