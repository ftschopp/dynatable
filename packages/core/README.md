# @ftschopp/dynatable-core

A type-safe, functional programming library for AWS DynamoDB with Single Table Design support. Built with TypeScript and designed to make DynamoDB development elegant and productive.

## Features

- 🔐 **Type-Safe** - Full TypeScript support with end-to-end type inference
- 🎯 **Single Table Design** - Built-in support for DynamoDB best practices
- 🔄 **Functional API** - Chainable, composable operations with immutable builders
- ⚡️ **Auto-generated IDs** - ULID/UUID generation for unique identifiers
- 🕒 **Automatic Timestamps** - Auto-manage `createdAt` and `updatedAt`
- 🔒 **Transactions** - Atomic operations with `TransactWrite` and `TransactGet`
- 📦 **Batch Operations** - Efficient `BatchGet` and `BatchWrite` operations
- 🎨 **Query Builder** - Intuitive, type-safe API for complex queries
- ✅ **Validation** - Built-in Zod schema validation
- 🧪 **Testable** - Easy to mock and test with AWS SDK client mock support

## Installation

```bash
npm install @ftschopp/dynatable-core
# or
yarn add @ftschopp/dynatable-core
# or
pnpm add @ftschopp/dynatable-core
```

## Quick Start

```typescript
import { Table } from '@ftschopp/dynatable-core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Define your schema
const schema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',
  indexes: {
    primary: { hash: 'PK', sort: 'SK' },
  },
  models: {
    User: {
      key: {
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'USER#${username}' },
      },
      attributes: {
        username: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
      },
    },
  },
  params: {
    timestamps: true,
    isoDates: true,
  },
} as const;

// Create DynamoDB client
const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const client = DynamoDBDocumentClient.from(ddbClient);

// Create table instance
const table = new Table({
  name: 'MyTable',
  client,
  schema,
});

// Use it!
async function example() {
  // Create
  const user = await table.entities.User.put({
    username: 'alice',
    name: 'Alice Smith',
    email: 'alice@example.com',
  }).execute();

  // Read
  const retrieved = await table.entities.User.get({
    username: 'alice',
  }).execute();

  // Update
  await table.entities.User.update({ username: 'alice' })
    .set('name', 'Alice Johnson')
    .execute();

  // Query
  const users = await table.entities.User.query()
    .where((attr, op) => op.eq(attr.username, 'alice'))
    .execute();

  // Delete
  await table.entities.User.delete({ username: 'alice' }).execute();
}
```

## Core Concepts

### Schema Definition

Define your data models with full type inference:

```typescript
const schema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',

  indexes: {
    primary: { hash: 'PK', sort: 'SK' },
    gsi1: { hash: 'GSI1PK', sort: 'GSI1SK' },
  },

  models: {
    User: {
      key: {
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'USER#${username}' },
      },
      index: {
        GSI1PK: { type: String, value: 'USER' },
        GSI1SK: { type: String, value: 'USER#${username}' },
      },
      attributes: {
        username: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String },
        userId: { type: String, generate: 'ulid' },
        followerCount: { type: Number, default: 0 },
      },
    },
  },

  params: {
    timestamps: true,      // Auto createdAt/updatedAt
    isoDates: true,        // Use ISO 8601 dates
    cleanInternalKeys: false, // Hide PK/SK from results
  },
} as const;
```

### Type Inference

Extract types from your schema:

```typescript
import type { InferModel, InferInput, InferKeyInput } from '@ftschopp/dynatable-core';

// Full model type (includes timestamps if enabled)
type User = InferModel<typeof schema.models.User>;
// { username: string; name: string; email?: string; userId: string; followerCount: number; createdAt: string; updatedAt: string }

// Input type (excludes generated fields and timestamps)
type UserInput = InferInput<typeof schema.models.User>;
// { username: string; name: string; email?: string; userId?: string; followerCount?: number }

// Key input type (only key template variables)
type UserKey = InferKeyInput<typeof schema.models.User>;
// { username: string }
```

### Builder Operations

All operations use the immutable builder pattern:

```typescript
// GET - Retrieve item
const user = await table.entities.User.get({ username: 'alice' })
  .select(['name', 'email'])
  .consistentRead()
  .execute();

// PUT - Insert/replace item
await table.entities.User.put({
  username: 'alice',
  name: 'Alice',
  email: 'alice@example.com',
})
  .ifNotExists()
  .returning('ALL_OLD')
  .execute();

// UPDATE - Modify attributes
await table.entities.User.update({ username: 'alice' })
  .set('name', 'Alice Johnson')
  .add('followerCount', 1)
  .remove('email')
  .returning('ALL_NEW')
  .where((attr, op) => op.gt(attr.followerCount, 0))
  .execute();

// DELETE - Remove item
await table.entities.User.delete({ username: 'alice' })
  .returning('ALL_OLD')
  .where((attr, op) => op.exists(attr.email))
  .execute();

// QUERY - Query with conditions
const photos = await table.entities.Photo.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'alice'),
      op.gt(attr.likesCount, 10)
    )
  )
  .limit(20)
  .scanIndexForward(false)
  .execute();

// SCAN - Full table scan with filter
const activeUsers = await table.entities.User.scan()
  .where((attr, op) => op.gt(attr.followerCount, 1000))
  .limit(50)
  .execute();

// BATCH GET - Retrieve multiple items
const users = await table.entities.User.batchGet([
  { username: 'alice' },
  { username: 'bob' },
  { username: 'charlie' },
]).execute();

// BATCH WRITE - Write multiple items
await table.entities.User.batchWrite([
  { username: 'alice', name: 'Alice', email: 'alice@example.com' },
  { username: 'bob', name: 'Bob', email: 'bob@example.com' },
]).execute();
```

### Transactions

Atomic operations across multiple items:

```typescript
// TransactWrite - Atomic writes
await table.transactWrite()
  .addPut(
    table.entities.Like.put({
      photoId: 'photo1',
      likingUsername: 'alice',
    })
      .ifNotExists()
      .dbParams()
  )
  .addUpdate(
    table.entities.Photo.update({ photoId: 'photo1' })
      .add('likesCount', 1)
      .dbParams()
  )
  .execute();

// TransactGet - Atomic reads
const result = await table.transactGet()
  .addGet(table.entities.User.get({ username: 'alice' }).dbParams())
  .addGet(table.entities.Photo.get({ photoId: 'photo1' }).dbParams())
  .execute();

const [user, photo] = result.items;
```

## Available Operators

Build complex conditions with type-safe operators:

### Comparison
- `eq(attr, value)` - Equals
- `ne(attr, value)` - Not equals
- `lt(attr, value)` - Less than
- `lte(attr, value)` - Less than or equal
- `gt(attr, value)` - Greater than
- `gte(attr, value)` - Greater than or equal
- `between(attr, low, high)` - Between values

### String
- `beginsWith(attr, prefix)` - Begins with prefix
- `contains(attr, value)` - Contains value (strings, sets, lists)

### Existence
- `exists(attr)` - Attribute exists
- `notExists(attr)` - Attribute doesn't exist

### Advanced
- `attributeType(attr, type)` - Check attribute type ('S', 'N', 'M', 'L', etc.)
- `in(attr, values[])` - Value in array
- `size(attr)` - Get size, returns object with `.eq()`, `.gt()`, etc.

### Logical
- `and(...conditions)` - Combine with AND
- `or(...conditions)` - Combine with OR
- `not(condition)` - Negate condition

### Examples

```typescript
// Exists check
await table.entities.User.update({ username: 'alice' })
  .set('email', 'alice@example.com')
  .where((attr, op) => op.notExists(attr.email))
  .execute();

// Contains
const users = await table.entities.User.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'alice'),
      op.contains(attr.tags, 'premium')
    )
  )
  .execute();

// IN operator
const activeUsers = await table.entities.User.scan()
  .where((attr, op) => op.in(attr.status, ['active', 'pending']))
  .execute();

// Size function
const posts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.userId, 'alice'),
      op.size(attr.tags).gte(3)
    )
  )
  .execute();

// Complex nested conditions
await table.entities.Photo.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'alice'),
      op.or(
        op.gt(attr.likesCount, 100),
        op.and(
          op.gt(attr.commentCount, 50),
          op.exists(attr.featured)
        )
      )
    )
  )
  .execute();
```

## DynamoDB Logger

Debug your DynamoDB operations:

```typescript
import { createDynamoDBLogger } from '@ftschopp/dynatable-core';

const logger = createDynamoDBLogger({
  enabled: true,
  logParams: true,
  logResponse: false,
});

const table = new Table({
  name: 'MyTable',
  client,
  schema,
  logger, // Attach logger
});

// All operations now logged to console
```

## Pagination

Built-in pagination support:

```typescript
// Execute with pagination
const page1 = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.userId, 'alice'))
  .limit(20)
  .executeWithPagination();

// Get next page
if (page1.lastEvaluatedKey) {
  const page2 = await table.entities.Post.query()
    .where((attr, op) => op.eq(attr.userId, 'alice'))
    .startFrom(page1.lastEvaluatedKey)
    .limit(20)
    .executeWithPagination();
}
```

## API Reference

### Core Exports

```typescript
export {
  Table,                      // Main Table class
  type SchemaDefinition,      // Schema type
  type ModelDefinition,       // Model type
  type InferModel,            // Infer model type
  type InferInput,            // Infer input type
  type InferKeyInput,         // Infer key type
  type InferModelFromSchema,  // Infer from schema
  type InferInputFromSchema,  // Infer input from schema
  type TimestampFields,       // Timestamp fields type
  createDynamoDBLogger,       // Logger factory
  type DynamoDBLogger,        // Logger type
  type DynamoDBLoggerConfig,  // Logger config
};
```

### Builder Types

Each builder type is exported for advanced use cases:

- `GetBuilder`, `PutBuilder`, `UpdateBuilder`, `DeleteBuilder`
- `QueryBuilder`, `ScanBuilder`
- `BatchGetBuilder`, `BatchWriteBuilder`
- `TransactWriteBuilder`, `TransactGetBuilder`
- `Condition`, `OpBuilder`, `AttrBuilder`, `SizeRef`

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (recommended)
- AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)

## Dependencies

- `@aws-sdk/client-dynamodb` ^3.965.0
- `@aws-sdk/lib-dynamodb` ^3.965.0
- `zod` ^4.3.5 - Runtime validation
- `ulid` ^3.0.2 - ULID generation
- `ramda` ^0.32.0 - Functional utilities

## Documentation

For complete documentation, examples, and guides, visit the [main repository](https://github.com/ftschopp/dynatable).

## Testing

The library includes comprehensive test coverage with Jest:

```bash
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please see the [main repository](https://github.com/ftschopp/dynatable) for contribution guidelines.

## Related Packages

- [@ftschopp/dynatable-migrations](https://www.npmjs.com/package/@ftschopp/dynatable-migrations) - Database migration tool for schema evolution
