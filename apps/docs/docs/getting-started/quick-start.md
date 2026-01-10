---
sidebar_position: 2
---

# Quick Start

Get up and running with Dynatable in 5 minutes. This guide will walk you through creating your first table and performing basic CRUD operations.

## 1. Define Your Schema

Create a schema file that defines your data models:

```typescript title="schema.ts"
export const BlogSchema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',
  indexes: {
    primary: {
      hash: 'pk',
      sort: 'sk',
    },
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
        bio: { type: String },
      },
    },
    Post: {
      key: {
        pk: { type: String, value: 'USER#${username}' },
        sk: { type: String, value: 'POST#${postId}' },
      },
      attributes: {
        username: { type: String, required: true },
        postId: { type: String, generate: 'ulid' },
        title: { type: String, required: true },
        content: { type: String },
        published: { type: Boolean, default: false },
      },
    },
  },
  params: {
    timestamps: true, // Automatic createdAt and updatedAt
    isoDates: true, // Store dates as ISO strings
  },
} as const;
```

:::tip
The `as const` at the end is crucial for proper TypeScript type inference.
:::

## 2. Create the Table Instance

Initialize your table with the AWS DynamoDB client:

```typescript title="table.ts"
import { Table } from 'dynatable';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BlogSchema } from './schema';

export const table = new Table({
  name: 'BlogTable',
  client: new DynamoDBClient({
    region: 'us-east-1',
  }),
  schema: BlogSchema,
});
```

## 3. Create the DynamoDB Table

Before using your table, you need to create it in DynamoDB:

```typescript title="setup-table.ts"
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });

await client.send(
  new CreateTableCommand({
    TableName: 'BlogTable',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  })
);

console.log('Table created successfully!');
```

:::info
For local development, make sure DynamoDB Local is running first.
:::

## 4. Perform CRUD Operations

Now you're ready to perform operations on your table!

### Create (Put)

Add a new user:

```typescript
const user = await table.entities.User.put({
  username: 'alice',
  name: 'Alice Smith',
  email: 'alice@example.com',
  bio: 'Software engineer and blogger',
}).execute();

console.log(user);
// {
//   username: 'alice',
//   name: 'Alice Smith',
//   email: 'alice@example.com',
//   bio: 'Software engineer and blogger',
//   createdAt: 2024-01-15T10:00:00.000Z,
//   updatedAt: 2024-01-15T10:00:00.000Z
// }
```

Create a post (with auto-generated ID):

```typescript
const post = await table.entities.Post.put({
  username: 'alice',
  title: 'My First Post',
  content: 'Hello, World!',
  published: true,
}).execute();

console.log(post.postId); // Auto-generated ULID
```

### Read (Get)

Retrieve a specific user:

```typescript
const user = await table.entities.User.get({
  username: 'alice',
}).execute();

console.log(user.name); // 'Alice Smith'
```

Get a specific post:

```typescript
const post = await table.entities.Post.get({
  username: 'alice',
  postId: '01HMQ7X8Y2K3N4M5P6Q7R8S9T0',
}).execute();
```

### Update

Update a user's bio:

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .set('bio', 'Senior software engineer and tech blogger')
  .execute();
```

Increment a counter:

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .add('postCount', 1)
  .execute();
```

### Delete

Delete a post:

```typescript
await table.entities.Post.delete({
  username: 'alice',
  postId: '01HMQ7X8Y2K3N4M5P6Q7R8S9T0',
}).execute();
```

## 5. Query Data

Find all posts by a user:

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();

console.log(posts.length); // Number of posts
```

Query with filtering and sorting:

```typescript
const recentPosts = await table.entities.Post.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.eq(attr.published, true)))
  .limit(10)
  .scanIndexForward(false) // Most recent first
  .execute();
```

## 6. Pagination

Handle large result sets with pagination:

```typescript
const result = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .limit(20)
  .executeWithPagination();

console.log(result.items); // First 20 posts
console.log(result.lastEvaluatedKey); // Key for next page

// Get next page
if (result.lastEvaluatedKey) {
  const nextPage = await table.entities.Post.query()
    .where((attr, op) => op.eq(attr.username, 'alice'))
    .limit(20)
    .startFrom(result.lastEvaluatedKey)
    .executeWithPagination();
}
```

## Complete Example

Here's a complete working example:

```typescript title="example.ts"
import { Table } from 'dynatable';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const BlogSchema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',
  indexes: {
    primary: { hash: 'pk', sort: 'sk' },
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
      },
    },
  },
  params: {
    timestamps: true,
  },
} as const;

const table = new Table({
  name: 'BlogTable',
  client: new DynamoDBClient({ region: 'us-east-1' }),
  schema: BlogSchema,
});

async function main() {
  // Create
  await table.entities.User.put({
    username: 'alice',
    name: 'Alice Smith',
    email: 'alice@example.com',
  }).execute();

  // Read
  const user = await table.entities.User.get({
    username: 'alice',
  }).execute();

  console.log(user);

  // Update
  await table.entities.User.update({ username: 'alice' }).set('name', 'Alice Johnson').execute();

  // Delete
  await table.entities.User.delete({
    username: 'alice',
  }).execute();
}

main();
```

## What's Next?

Now that you've completed the quick start, dive deeper into specific topics:

- **[Schema Basics](./schema-basics)** - Learn about schema definition in detail
- **[Data Modeling](../guides/data-modeling)** - Design your data models effectively
- **[Queries](../guides/queries)** - Master querying and filtering
- **[Mutations](../guides/mutations)** - Learn all mutation operations
