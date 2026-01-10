---
sidebar_position: 1
slug: /
---

# Introduction

**Dynatable** is a type-safe, functional TypeScript library for Amazon DynamoDB. Built with modern TypeScript features and functional programming principles, it provides a robust and developer-friendly way to work with DynamoDB.

## Why Dynatable?

DynamoDB is powerful but has a steep learning curve. Dynatable simplifies DynamoDB development while maintaining full type safety and leveraging functional programming patterns.

### Key Features

#### Type-Safe by Design

Complete TypeScript type inference from your schema definitions. Get autocomplete and compile-time error detection throughout your entire codebase.

```typescript
const user = await table.entities.User.get({ username: 'alice' }).execute();
//    ^? User: { username: string, name: string, email: string, ... }
```

#### Functional & Immutable

Immutable builder API that prevents side effects and makes your code more predictable and easier to reason about.

```typescript
const baseQuery = table.entities.Post.query().where((attr, op) => op.eq(attr.username, 'alice'));

// Create variations without mutating the original
const recentPosts = baseQuery.limit(10).scanIndexForward(false);
const allPosts = baseQuery.execute();
```

#### Runtime Validation

Automatic data validation with Zod ensures your data always matches your schema.

```typescript
await table.entities.User.put({
  username: 'alice',
  email: 'invalid-email', // Error: Invalid email format
}).execute();
```

#### Developer Experience First

- Automatic timestamps (`createdAt`, `updatedAt`)
- Built-in pagination support
- Auto-generated IDs (ULID, UUID)
- Single-table design patterns
- Comprehensive transaction support
- Efficient batch operations

## Architecture Overview

Dynatable follows a layered architecture:

```
┌─────────────────────────────────────┐
│         Schema Definition           │
│   (Define your data models)         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│            Table API                │
│   (Main entry point)                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│          Entity APIs                │
│   (User, Post, Comment, etc.)       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│       Operation Builders            │
│  (Get, Put, Query, Update, etc.)    │
└─────────────────────────────────────┘
```

## Core Concepts

Before diving into Dynatable, it's helpful to understand a few core concepts:

### Entities

Entities represent your data models (e.g., User, Post, Comment). Each entity has:

- A unique key structure (partition key and optionally sort key)
- Defined attributes with types and constraints
- Optional automatic behaviors (timestamps, ID generation)

### Builders

All operations use immutable builders that allow you to chain methods to construct your query or mutation:

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .limit(20)
  .scanIndexForward(false)
  .execute();
```

### Type Inference

Your schema is the source of truth. Types flow automatically from your schema definition to all operations:

```typescript
const schema = {
  models: {
    User: {
      attributes: {
        username: { type: String, required: true },
        email: { type: String, required: true },
      },
    },
  },
} as const; // ← as const is important for type inference

// TypeScript knows exactly what fields exist
const user = await table.entities.User.get({ username: 'alice' }).execute();
console.log(user.email); // ✅ Type-safe
console.log(user.invalid); // ❌ TypeScript error
```

## What's Next?

Ready to get started? Here's your learning path:

1. **[Getting Started](/docs/getting-started/installation)** - Install and set up Dynatable
2. **[Data Modeling](/docs/guides/data-modeling)** - Learn how to design your schema
3. **[Single Table Design](/docs/guides/single-table-design)** - Master single-table patterns
4. **[Queries](/docs/guides/queries)** - Read and filter your data
5. **[Mutations](/docs/guides/mutations)** - Create, update, and delete operations
6. **[Examples](/docs/examples/blog-system)** - See real-world examples

## Community & Support

- **GitHub**: [github.com/choppsources/dynatable](https://github.com/choppsources/dynatable)
- **Issues**: [Report bugs or request features](https://github.com/choppsources/dynatable/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/choppsources/dynatable/discussions)

## License

MIT © 2024 Dynatable
