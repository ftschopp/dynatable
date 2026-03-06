---
sidebar_position: 1
title: Overview
---

# Migrations

DynamoDB migration tool for single table design with schema versioning.

## Why Migrations?

In traditional SQL databases, schema changes require `ALTER TABLE` statements. DynamoDB is schemaless, but your application still has an implicit schema - the structure of your data.

When you need to:
- Add new fields to existing items
- Transform data formats
- Change key structures
- Add new entity types

You need a way to evolve your data safely and consistently across environments.

## Features

- **Single Table Design** - Built specifically for DynamoDB single table design patterns
- **Semantic Versioning** - Migrations use semver (0.1.0, 0.2.0, 1.0.0) for clear version tracking
- **Up/Down Migrations** - Support for both applying and rolling back migrations
- **Migration History** - All migration records stored in your DynamoDB table
- **Distributed Locking** - Prevents concurrent migrations with automatic lock expiration
- **Dry Run Mode** - Preview changes before applying them
- **TypeScript First** - Full TypeScript support with type safety

## How It Works

All migration tracking happens **within your DynamoDB table** using Single Table Design principles:

```
PK                      SK                version  status     appliedAt
-----------------------------------------------------------------------
_SCHEMA#VERSION         0.1.0             0.1.0    applied    2025-03-29T10:00:00Z
_SCHEMA#VERSION         0.2.0             0.2.0    applied    2025-03-29T11:00:00Z
_SCHEMA#VERSION#CURRENT _SCHEMA#VERSION   0.2.0    -          2025-03-29T11:00:00Z
```

No separate tracking table needed - everything lives in your existing table.

## Quick Example

```typescript
import { Migration } from '@ftschopp/dynatable-migrations';

export const migration: Migration = {
  version: '0.1.0',
  name: 'add_user_email',
  description: 'Add email field to all users',

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

    // Add email field
    for (const user of result.Items || []) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: 'SET email = :email',
          ExpressionAttributeValues: { ':email': null },
        })
      );
    }
  },

  async down(context) {
    // Rollback logic...
  },
};
```

## Next Steps

- [Getting Started](./getting-started.md) - Install and run your first migration
- [CLI Reference](./cli-reference.md) - All available commands
- [Migration Patterns](./patterns.md) - Common patterns and best practices
