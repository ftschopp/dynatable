# Dynatable

A type-safe, functional programming library for AWS DynamoDB with Single Table Design support. Built with TypeScript and designed to make DynamoDB development elegant and productive.

## ✨ Features

- 🔐 **Type-Safe** - Full TypeScript support with end-to-end type inference
- 🎯 **Single Table Design** - Built-in support for DynamoDB best practices
- 🔄 **Functional API** - Chainable, composable operations
- ⚡️ **Auto-generated IDs** - ULID generation for unique identifiers
- 🕒 **Automatic Timestamps** - Auto-manage `createdAt` and `updatedAt`
- 🔒 **Transactions** - Atomic operations with `TransactWrite` support
- 📦 **Batch Operations** - Efficient `BatchGet` and `BatchWrite`
- 🎨 **Query Builder** - Intuitive API for complex queries
- ✅ **Validation** - Built-in Zod schema validation
- 🧪 **Testable** - Easy to mock and test

## 📦 Installation

```bash
npm install @ftschopp/dynatable-core
# or
yarn add @ftschopp/dynatable-core
# or
pnpm add @ftschopp/dynatable-core
```

## 🚀 Quick Start

```typescript
import { Table } from '@ftschopp/dynatable-core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// Define your schema
const schema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',

  indexes: {
    primary: { hash: 'pk', sort: 'sk' },
    gs1: { hash: 'gsi1pk', sort: 'gsi1sk' },
  },

  models: {
    User: {
      key: {
        pk: { type: String, value: 'USER#${username}' },
        sk: { type: String, value: 'USER#${username}' },
      },
      attributes: {
        username: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        followerCount: { type: Number, default: 0 },
      },
    },
  },

  params: {
    timestamps: true,
    isoDates: true,
  },
} as const;

// Create table instance
const table = new Table({
  name: 'MyTable',
  client: new DynamoDBClient({ region: 'us-east-1' }),
  schema,
});

// Use it!
async function example() {
  // Create
  const user = await table.entities.User.put({
    username: 'alice',
    name: 'Alice Smith',
    email: 'alice@example.com',
  })
    .ifNotExists()
    .execute();

  // Read
  const retrieved = await table.entities.User.get({
    username: 'alice',
  }).execute();

  // Update
  await table.entities.User.update({
    username: 'alice',
  })
    .set('name', 'Alice Johnson')
    .add('followerCount', 1)
    .returning('ALL_NEW')
    .execute();

  // Query
  const users = await table.entities.User.query()
    .where((attr, op) => op.eq(attr.username, 'alice'))
    .execute();

  // Delete
  await table.entities.User.delete({
    username: 'alice',
  }).execute();
}
```

## 🔐 Type Safety

Dynatable provides full TypeScript support with AWS SDK types for maximum type safety:

### Entity Operations

All entity operations (`put`, `update`, `delete`, `get`) have typed `dbParams()` methods:

```typescript
// dbParams() returns PutCommandInput from @aws-sdk/lib-dynamodb
const params = table.entities.User.put({ username: 'alice', name: 'Alice' }).dbParams();
// params: PutCommandInput

// Update operations return UpdateCommandInput
const updateParams = table.entities.User.update({ username: 'alice' }).set('name', 'Bob').dbParams();
// updateParams: UpdateCommandInput
```

### Transaction Operations

Transaction builders accept typed parameters from AWS SDK:

```typescript
import type {
  TransactPutParams,
  TransactUpdateParams,
} from '@ftschopp/dynatable-core';

await table
  .transactWrite()
  .addPut(table.entities.Like.put({ photoId: '123', likingUsername: 'alice' }).dbParams())
  .addUpdate(table.entities.Photo.update({ username: 'bob', photoId: '123' }).add('likesCount', 1).dbParams())
  .execute();
```

TypeScript validates all parameters at compile time, catching errors before runtime.

## 📖 Documentation

Full documentation is available at the [docs site](./apps/docs):

- [Getting Started](./apps/docs/docs/getting-started)
- [Schema Basics](./apps/docs/docs/getting-started/schema-basics.md)
- [Single Table Design Guide](./apps/docs/docs/guides/single-table-design.md)
- [Data Modeling](./apps/docs/docs/guides/data-modeling.md)
- [Queries](./apps/docs/docs/guides/queries.md)
- [Mutations](./apps/docs/docs/guides/mutations.md)

### Examples

Check out complete examples:

- [Blog System](./apps/docs/docs/examples/blog-system.md) - Users, posts, comments, and tags
- [Instagram Clone](./apps/docs/docs/examples/instagram-clone.md) - Photos, likes, comments, and followers

## 🏗️ Project Structure

This is a Turborepo monorepo with the following structure:

```
dynatable/
├── apps/
│   ├── crud/          # Example CRUD application
│   └── docs/          # Docusaurus documentation site
├── packages/
│   ├── core/          # Main Dynatable library
│   ├── eslint-config/ # Shared ESLint configuration
│   └── typescript-config/ # Shared TypeScript configuration
```

### Packages

- **`@ftschopp/dynatable-core`** - The main Dynatable library with full type-safe DynamoDB operations
- **`@ftschopp/dynatable-migrations`** - DynamoDB migration tool with schema versioning and single table design support
- **`@repo/eslint-config`** - Shared ESLint configurations for all packages
- **`@repo/typescript-config`** - Shared TypeScript configurations for all packages

### Apps

- **`crud`** - Example CRUD application demonstrating Dynatable usage
- **`docs`** - Docusaurus documentation site with examples and guides

## 🔧 Development

### Prerequisites

- Node.js >= 18
- Yarn 1.22.22

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd dynatable

# Install dependencies
yarn install

# Build all packages
yarn build
```

### Available Scripts

```bash
# Development
yarn dev              # Start development for all apps
yarn debug            # Start development for CRUD app only

# Build
yarn build            # Build all packages and apps

# Testing
yarn test             # Run tests across all packages

# Linting & Formatting
yarn lint             # Lint all packages
yarn format           # Format code with Prettier
yarn check-types      # Type check all packages

# Clean
yarn clean            # Remove all node_modules and build artifacts
```

### Running the Documentation Site

```bash
cd apps/docs
npm run start         # Start development server
npm run build         # Build for production
```

### Running the CRUD Example

```bash
cd apps/crud
npm run dev           # Start with hot reload
```

## 🎯 Core Concepts

### Single Table Design

Dynatable is built around DynamoDB's Single Table Design pattern, where all entities live in one table:

```typescript
// Different entities, same table
table.entities.User.put({ username: 'alice', name: 'Alice' });
table.entities.Post.put({ userId: 'alice', postId: 'post1', title: 'Hello' });
table.entities.Comment.put({
  postId: 'post1',
  commentId: 'c1',
  content: 'Great!',
});
```

### Type Safety

Full TypeScript inference throughout:

```typescript
const user = await table.entities.User.get({ username: 'alice' }).execute();
// user is typed as: User | undefined

user.username; // ✅ Type: string
user.name; // ✅ Type: string
user.email; // ✅ Type: string
user.invalid; // ❌ TypeScript error
```

### Transactions

Atomic operations across multiple items:

```typescript
await table
  .transactWrite()
  .addPut(
    table.entities.Like.put({
      photoId: 'photo1',
      username: 'alice',
    })
      .ifNotExists()
      .dbParams()
  )
  .addUpdate(
    table.entities.Photo.update({
      photoId: 'photo1',
    })
      .add('likesCount', 1)
      .dbParams()
  )
  .execute();
```

### Query Builder

Fluent, type-safe query API:

```typescript
const photos = await table.entities.Photo.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.gt(attr.likesCount, 10)))
  .limit(20)
  .scanIndexForward(false)
  .execute();
```

### Pagination

Built-in pagination support:

```typescript
const page1 = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.userId, 'alice'))
  .limit(20)
  .executeWithPagination();

// Next page
if (page1.lastEvaluatedKey) {
  const page2 = await table.entities.Post.query()
    .where((attr, op) => op.eq(attr.userId, 'alice'))
    .startFrom(page1.lastEvaluatedKey)
    .limit(20)
    .executeWithPagination();
}
```

## 🧪 Testing

The library includes comprehensive test coverage:

```bash
# Run all tests
yarn test

# Run tests for core package only
cd packages/core
yarn test
```

Example test:

```typescript
import { describe, it, expect } from 'vitest';

describe('User operations', () => {
  it('should create a user', async () => {
    const user = await table.entities.User.put({
      username: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
    }).execute();

    expect(user.username).toBe('testuser');
    expect(user.createdAt).toBeDefined();
  });
});
```

## 🔑 Key Features Explained

### Auto-generated IDs

```typescript
const photo = await table.entities.Photo.put({
  username: 'alice',
  url: 'https://example.com/photo.jpg',
}).execute();

console.log(photo.photoId); // Auto-generated ULID: 01HZXY9K2M3N4P5Q6R7S8T9V0W
```

### Automatic Timestamps

```typescript
const user = await table.entities.User.put({
  username: 'alice',
  name: 'Alice',
}).execute();

console.log(user.createdAt); // ISO 8601: 2025-01-15T10:30:00.000Z
console.log(user.updatedAt); // ISO 8601: 2025-01-15T10:30:00.000Z

// Update automatically updates updatedAt
await table.entities.User.update({ username: 'alice' }).set('name', 'Alice Smith').execute();
// updatedAt is now: 2025-01-15T10:35:00.000Z
```

### Conditional Operations

```typescript
// Only create if doesn't exist
await table.entities.User.put({
  username: 'alice',
  name: 'Alice',
})
  .ifNotExists()
  .execute();

// Only update if condition is met
await table.entities.Post.update({
  postId: 'post1',
})
  .set('published', true)
  .where((attr, op) => op.eq(attr.status, 'draft'))
  .execute();
```

### Batch Operations

```typescript
// Batch Get
const users = await table.entities.User.batchGet([
  { username: 'alice' },
  { username: 'bob' },
  { username: 'charlie' },
]).execute();

// Batch Write
await table.entities.User.batchWrite([
  { username: 'alice', name: 'Alice', email: 'alice@example.com' },
  { username: 'bob', name: 'Bob', email: 'bob@example.com' },
]).execute();
```

### GSI (Global Secondary Index) Support

```typescript
// Query using GSI
const publishedPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.gsi1pk, 'POST'), op.beginsWith(attr.gsi1sk, 'STATUS#true'))
  )
  .useIndex('gsi1')
  .execute();
```

### Scan Operations

```typescript
// Scan entire table with filter
const activeUsers = await table.entities.User.scan()
  .where((attr, op) => op.gt(attr.followerCount, 1000))
  .limit(50)
  .execute();

// Scan with pagination
const page = await table.entities.User.scan()
  .limit(20)
  .executeWithPagination();
```

### Advanced Operators

Dynatable provides a comprehensive set of operators for building complex conditions:

```typescript
// Exists/Not Exists
await table.entities.User.update({ username: 'alice' })
  .set('email', 'alice@example.com')
  .where((attr, op) => op.notExists(attr.email))
  .execute();

// Contains (for strings, sets, lists)
const users = await table.entities.User.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'alice'),
      op.contains(attr.tags, 'premium')
    )
  )
  .execute();

// IN operator
const users = await table.entities.User.scan()
  .where((attr, op) => op.in(attr.status, ['active', 'pending', 'verified']))
  .execute();

// Size function (for strings, sets, lists, maps)
const posts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.userId, 'alice'),
      op.size(attr.tags).gte(3) // Posts with 3+ tags
    )
  )
  .execute();

// Attribute type checking
await table.entities.User.scan()
  .where((attr, op) => op.attributeType(attr.metadata, 'M')) // Type is Map
  .execute();
```

### DynamoDB Logger

Track and debug your DynamoDB operations with the built-in logger:

```typescript
import { createDynamoDBLogger } from '@ftschopp/dynatable-core';

// Create a logger
const logger = createDynamoDBLogger({
  enabled: true,      // Enable/disable logging
  logParams: true,    // Log request parameters
  logResponse: false, // Log responses (can be verbose)
});

// Use with Table
const table = new Table({
  name: 'MyTable',
  client,
  schema,
  logger, // Attach the logger
});

// Now all operations are logged to console
await table.entities.User.get({ username: 'alice' }).execute();
// Logs: [DynamoDB] GetCommand { TableName: 'MyTable', Key: { PK: 'USER#alice', SK: 'USER#alice' } }
```

### Middleware System

Extend Dynatable with custom middleware for request/response transformation:

```typescript
// Middleware to clean internal keys from responses
const cleanKeysMiddleware = {
  response: (item: any) => {
    const { PK, SK, GSI1PK, GSI1SK, ...cleaned } = item;
    return cleaned;
  }
};

// Middleware is automatically applied based on schema params
// Set cleanInternalKeys: true in schema params to enable built-in middleware
```

### TransactGet Operations

Atomic reads across multiple items:

```typescript
// Read multiple items atomically
const result = await table.transactGet()
  .addGet(table.entities.User.get({ username: 'alice' }).dbParams())
  .addGet(table.entities.Photo.get({ username: 'alice', photoId: 'photo1' }).dbParams())
  .addGet(table.entities.Like.get({ photoId: 'photo1', likingUsername: 'bob' }).dbParams())
  .execute();

// result.items contains all items or transaction fails
const [user, photo, like] = result.items;
```

## 📚 Complete API Reference

### Core Exports

```typescript
import {
  Table,                          // Main Table class
  type SchemaDefinition,          // Schema type definition
  type ModelDefinition,           // Model type definition
  type InferModel,                // Infer model type from definition
  type InferInput,                // Infer input type from definition
  type InferKeyInput,             // Infer key input type
  type InferModelFromSchema,      // Infer model type from full schema
  type InferInputFromSchema,      // Infer input type from full schema
  createDynamoDBLogger,           // Create logger instance
  type DynamoDBLogger,            // Logger type
  type DynamoDBLoggerConfig,      // Logger config type
} from '@ftschopp/dynatable-core';
```

### Available Builders

Each entity provides the following builder methods:

- **`get(key)`** → `GetBuilder` - Retrieve a single item by key
- **`put(item)`** → `PutBuilder` - Insert or replace an item
- **`update(key)`** → `UpdateBuilder` - Update specific attributes
- **`delete(key)`** → `DeleteBuilder` - Remove an item
- **`query()`** → `QueryBuilder` - Query items with key conditions
- **`scan()`** → `ScanBuilder` - Scan table/index with filters
- **`batchGet(keys[])`** → `BatchGetBuilder` - Retrieve up to 100 items
- **`batchWrite(items[])`** → `BatchWriteBuilder` - Write up to 25 items

Table-level operations:

- **`table.transactWrite()`** → `TransactWriteBuilder` - Atomic write operations
- **`table.transactGet()`** → `TransactGetBuilder` - Atomic read operations

### All Available Operators

#### Comparison Operators
- **`eq(attr, value)`** - Equals (=)
- **`ne(attr, value)`** - Not equals (<>)
- **`lt(attr, value)`** - Less than (<)
- **`lte(attr, value)`** - Less than or equal (<=)
- **`gt(attr, value)`** - Greater than (>)
- **`gte(attr, value)`** - Greater than or equal (>=)
- **`between(attr, low, high)`** - Between two values

#### String Operators
- **`beginsWith(attr, prefix)`** - Begins with a string prefix
- **`contains(attr, value)`** - Contains a substring/value (works with strings, sets, lists)

#### Existence Operators
- **`exists(attr)`** - Attribute exists
- **`notExists(attr)`** - Attribute does not exist

#### Type Checking
- **`attributeType(attr, type)`** - Check attribute type
  - Types: `'S'` (String), `'N'` (Number), `'B'` (Binary), `'SS'` (String Set), `'NS'` (Number Set), `'BS'` (Binary Set), `'M'` (Map), `'L'` (List), `'NULL'`, `'BOOL'`

#### Advanced Operators
- **`in(attr, values[])`** - Value is in array
- **`size(attr)`** - Get size of attribute, returns `SizeRef` with comparison methods:
  - `.eq(n)`, `.ne(n)`, `.lt(n)`, `.lte(n)`, `.gt(n)`, `.gte(n)`

#### Logical Operators
- **`and(...conditions)`** - Combine conditions with AND
- **`or(...conditions)`** - Combine conditions with OR
- **`not(condition)`** - Negate a condition

### Builder Methods Reference

#### GetBuilder
```typescript
.select(attributes?: string[])      // Project specific attributes
.consistentRead(enabled?: boolean)  // Enable consistent read
.dbParams()                         // Get raw DynamoDB parameters
.execute()                          // Execute and return item
```

#### PutBuilder
```typescript
.ifNotExists()                      // Only put if item doesn't exist
.returning(value: 'NONE' | 'ALL_OLD') // Return values
.where(condition)                   // Conditional expression
.dbParams()                         // Get raw parameters
.execute()                          // Execute operation
```

#### UpdateBuilder
```typescript
.set(attr, value)                   // Set attribute value
.remove(attr)                       // Remove attribute
.add(attr, value)                   // Add to number/set
.delete(attr, value)                // Delete from set
.returning('NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW')
.where(condition)                   // Conditional expression
.dbParams()                         // Get raw parameters
.execute()                          // Execute operation
```

#### DeleteBuilder
```typescript
.returning(value: 'NONE' | 'ALL_OLD') // Return deleted item
.where(condition)                   // Conditional expression
.dbParams()                         // Get raw parameters
.execute()                          // Execute operation
```

#### QueryBuilder
```typescript
.where(condition)                   // Key condition + filter expression
.limit(count)                       // Max items to return
.scanIndexForward(forward: boolean) // Sort order (default: true)
.useIndex(indexName)                // Use GSI/LSI
.select(attributes?: string[])      // Project attributes
.consistentRead(enabled?: boolean)  // Consistent read
.startFrom(lastKey)                 // Pagination cursor
.execute()                          // Execute and return items
.executeWithPagination()            // Execute and return { items, lastEvaluatedKey }
```

#### ScanBuilder
```typescript
.where(condition)                   // Filter expression
.limit(count)                       // Max items to return
.select(attributes?: string[])      // Project attributes
.consistentRead(enabled?: boolean)  // Consistent read
.startFrom(lastKey)                 // Pagination cursor
.execute()                          // Execute and return items
.executeWithPagination()            // Execute and return { items, lastEvaluatedKey }
```

#### BatchGetBuilder
```typescript
.select(attributes?: string[])      // Project attributes
.consistentRead(enabled?: boolean)  // Consistent read
.execute()                          // Execute and return items array
```

#### BatchWriteBuilder
```typescript
.execute()                          // Execute batch write
```

#### TransactWriteBuilder
```typescript
.addPut(params)                     // Add put operation
.addUpdate(params)                  // Add update operation
.addDelete(params)                  // Add delete operation
.addConditionCheck(params)          // Add condition check
.withClientRequestToken(token)      // Idempotency token
.execute()                          // Execute transaction
```

#### TransactGetBuilder
```typescript
.addGet(params)                     // Add get operation
.execute()                          // Execute transaction, returns { items }
```

### Schema Definition

```typescript
const schema = {
  format: 'dynatable:1.0.0',        // Schema format version
  version: '1.0.0',                 // Your schema version

  indexes: {
    primary: {
      hash: 'PK',                   // Partition key name
      sort: 'SK'                    // Sort key name (optional)
    },
    gsi1: {                         // Global Secondary Index
      hash: 'GSI1PK',
      sort: 'GSI1SK'
    },
  },

  models: {
    User: {
      key: {                        // Primary key definition
        PK: {
          type: String,
          value: 'USER#${username}' // Template with variables
        },
        SK: {
          type: String,
          value: 'USER#${username}'
        },
      },
      index: {                      // GSI key definition (optional)
        GSI1PK: { type: String, value: 'USER' },
        GSI1SK: { type: String, value: 'USER#${username}' },
      },
      attributes: {
        username: {
          type: String,
          required: true
        },
        name: {
          type: String,
          required: true
        },
        email: {
          type: String
        },
        age: {
          type: Number,
          default: 0
        },
        userId: {
          type: String,
          generate: 'ulid'          // Auto-generate ULID
        },
        tags: {
          type: Array
        },
      },
    },
  },

  params: {
    timestamps: true,               // Auto createdAt/updatedAt
    isoDates: true,                 // Use ISO 8601 format
    cleanInternalKeys: false,       // Hide PK/SK in results
  },
} as const;
```

### Type Inference

```typescript
// Infer model type (includes timestamps if enabled)
type User = InferModel<typeof schema.models.User>;

// Infer input type (excludes generated fields and timestamps)
type UserInput = InferInput<typeof schema.models.User>;

// Infer key input type (only key template variables)
type UserKey = InferKeyInput<typeof schema.models.User>;

// Infer from full schema by name
type UserFromSchema = InferModelFromSchema<typeof schema, 'User'>;
type UserInputFromSchema = InferInputFromSchema<typeof schema, 'User'>;
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with [TypeScript](https://www.typescriptlang.org/)
- Uses [Zod](https://zod.dev/) for validation
- Uses [ULID](https://github.com/ulid/javascript) for ID generation
- Powered by [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

## 📚 Additional Resources

- [AWS DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [The DynamoDB Book by Alex DeBrie](https://www.dynamodbbook.com/)
- [Single Table Design with DynamoDB](https://www.alexdebrie.com/posts/dynamodb-single-table/)
- [AWS re:Invent - Advanced Design Patterns for DynamoDB](https://www.youtube.com/watch?v=HaEPXoXVf2k)

## 🔗 Links

- [Documentation](./apps/docs)
- [Examples](./apps/docs/docs/examples)
- [Core Package](./packages/core)
- [CRUD Example App](./apps/crud)

---

**Made with ❤️ for the DynamoDB community**
