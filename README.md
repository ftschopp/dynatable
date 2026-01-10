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

- **`@ftschopp/dynatable-core`** - The main Dynatable library
- **`@ftschopp/dynatable-migrations`** - DynamoDB migration tool
- **`@repo/eslint-config`** - ESLint configurations
- **`@repo/typescript-config`** - TypeScript configurations

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
