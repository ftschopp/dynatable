---
sidebar_position: 1
---

# Single Table Design

Single-table design is a powerful pattern for DynamoDB that stores multiple entity types in one table. Dynatable makes single-table design type-safe and easy to implement.

## Why Single Table Design?

### Benefits

- **Cost Efficient**: One table means fewer resources and lower costs
- **Atomic Transactions**: Related entities in the same table can be updated atomically
- **Better Performance**: Fewer round trips to fetch related data
- **Simpler Infrastructure**: Manage one table instead of many

### Trade-offs

- **Steeper Learning Curve**: Requires careful access pattern planning
- **Schema Changes**: More complex than multi-table designs
- **Query Complexity**: Need to understand key design patterns

## Core Concepts

### Generic Keys

Instead of entity-specific keys, use generic names:

```typescript
indexes: {
  primary: {
    hash: "PK",   // Not "userId" or "customerId"
    sort: "SK"    // Generic for all entities
  }
}
```

### Entity Prefixes

Use prefixes to namespace different entity types:

```typescript
User: {
  key: {
    PK: { type: String, value: "USER#${username}" },
    SK: { type: String, value: "USER#${username}" }
  }
}

Post: {
  key: {
    PK: { type: String, value: "USER#${username}" },
    SK: { type: String, value: "POST#${postId}" }
  }
}

Comment: {
  key: {
    PK: { type: String, value: "POST#${postId}" },
    SK: { type: String, value: "COMMENT#${commentId}" }
  }
}
```

## Access Patterns

Design your keys based on how you'll query your data.

### Pattern 1: One-to-Many Relationships

Store related entities together using the same partition key:

```typescript
// User entity
PK: 'USER#alice';
SK: 'USER#alice';

// User's posts
PK: 'USER#alice';
SK: 'POST#01HMQ...';
SK: 'POST#01HMR...';
SK: 'POST#01HMS...';
```

**Query all posts by a user:**

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();
```

### Pattern 2: Hierarchical Data

Use hierarchical sort keys for nested relationships:

```typescript
// Post
PK: 'POST#123';
SK: 'POST#123';

// Comments on post
PK: 'POST#123';
SK: 'COMMENT#01HMQ...';
SK: 'COMMENT#01HMR...';

// Reactions to comment
PK: 'POST#123';
SK: 'COMMENT#01HMQ...#REACTION#01HMS...';
```

### Pattern 3: Many-to-Many Relationships

Use join entities to model many-to-many:

```typescript
// User
PK: 'USER#alice';
SK: 'USER#alice';

// Group
PK: 'GROUP#developers';
SK: 'GROUP#developers';

// Membership (User → Group)
PK: 'USER#alice';
SK: 'MEMBER#GROUP#developers';

// Membership (Group → User)
PK: 'GROUP#developers';
SK: 'MEMBER#USER#alice';
```

## Complete Example: Blog System

Let's build a blog with users, posts, comments, and tags. GSI key templates live on each model's `index:` field, not inside `attributes:`:

```typescript
const BlogSchema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',

  indexes: {
    primary: {
      hash: 'PK',
      sort: 'SK',
    },
    gsi1: {
      hash: 'GSI1PK',
      sort: 'GSI1SK',
    },
  },

  models: {
    // User profile
    User: {
      key: {
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'USER#${username}' },
      },
      attributes: {
        username: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        bio: { type: String },
      },
    },

    // Posts by user
    Post: {
      key: {
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'POST#${postId}' },
      },
      index: {
        // GSI for querying all posts by status
        GSI1PK: { type: String, value: 'POST' },
        GSI1SK: { type: String, value: 'STATUS#${published}#${postId}' },
      },
      attributes: {
        username: { type: String, required: true },
        postId: { type: String, generate: 'ulid' },
        title: { type: String, required: true },
        content: { type: String },
        published: { type: Boolean, default: false },
      },
    },

    // Comments on posts
    Comment: {
      key: {
        PK: { type: String, value: 'POST#${postId}' },
        SK: { type: String, value: 'COMMENT#${commentId}' },
      },
      index: {
        // GSI for querying comments by user
        GSI1PK: { type: String, value: 'USER#${username}' },
        GSI1SK: { type: String, value: 'COMMENT#${commentId}' },
      },
      attributes: {
        postId: { type: String, required: true },
        commentId: { type: String, generate: 'ulid' },
        username: { type: String, required: true },
        content: { type: String, required: true },
      },
    },

    // Tags for posts (many-to-many)
    PostTag: {
      key: {
        PK: { type: String, value: 'POST#${postId}' },
        SK: { type: String, value: 'TAG#${tag}' },
      },
      index: {
        // GSI for reverse lookup (tag → posts)
        GSI1PK: { type: String, value: 'TAG#${tag}' },
        GSI1SK: { type: String, value: 'POST#${postId}' },
      },
      attributes: {
        postId: { type: String, required: true },
        tag: { type: String, required: true },
      },
    },
  },

  params: {
    timestamps: true,
  },
} as const;
```

### Supported Access Patterns

With this schema, you can efficiently query:

#### 1. Get user profile

```typescript
const user = await table.entities.User.get({
  username: 'alice',
}).execute();
```

#### 2. Get all posts by user

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();
```

#### 3. Get all comments on a post

```typescript
const comments = await table.entities.Comment.query()
  .where((attr, op) => op.eq(attr.postId, 'POST#123'))
  .execute();
```

#### 4. Get all published posts (using GSI)

```typescript
const publishedPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.GSI1PK, 'POST'), op.beginsWith(attr.GSI1SK, 'STATUS#true'))
  )
  .useIndex('gsi1')
  .execute();
```

#### 5. Get all comments by a user (using GSI)

```typescript
const userComments = await table.entities.Comment.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .useIndex('gsi1')
  .execute();
```

#### 6. Get all posts with a tag (using GSI)

```typescript
const postsWithTag = await table.entities.PostTag.query()
  .where((attr, op) => op.eq(attr.tag, 'typescript'))
  .useIndex('gsi1')
  .execute();
```

## Best Practices

### 1. Plan Your Access Patterns First

Before designing keys, list all ways you'll query your data:

```
✓ Get user by username
✓ Get all posts by user
✓ Get all comments on a post
✓ Get all published posts
✓ Get all posts with a tag
✓ Get user's comment history
```

### 2. Use Prefixes Consistently

Always prefix keys with entity type:

```typescript
// Good
PK: 'USER#${username}';
PK: 'POST#${postId}';
PK: 'COMMENT#${commentId}';

// Bad - inconsistent
PK: '${username}';
PK: 'post_${postId}';
PK: 'Comment-${commentId}';
```

### 3. Leverage Sort Key Ordering

DynamoDB sorts items by sort key. Use this for natural ordering:

```typescript
// Time-sorted posts (ULID sorts by time)
SK: 'POST#${postId}'; // ULID auto-sorts by creation time

// Explicitly sorted
SK: 'POST#${createdAt}#${postId}';

// Status and time
SK: 'STATUS#${published}#${createdAt}';
```

### 4. Design GSIs for Alternative Access Patterns

Use GSIs for queries that can't use the primary key. Declare them on the model's `index:`:

```typescript
// Primary: Query posts by user
key: {
  PK: { type: String, value: 'USER#${username}' },
  SK: { type: String, value: 'POST#${postId}' },
}

// GSI1: Query posts by status
index: {
  GSI1PK: { type: String, value: 'POST' },
  GSI1SK: { type: String, value: 'STATUS#${published}#${createdAt}' },
}

// GSI2: Query posts by tag (on a separate model — see PostTag above)
```

### 5. Handle Many-to-Many with Dual Writes

For many-to-many, design both directions into the same join entity using `key:` (for the forward lookup) and `index:` (for the reverse lookup). The `PostTag` model above shows this pattern — a single put writes both lookups:

```typescript
await table.entities.PostTag.put({
  postId: '123',
  tag: 'typescript',
}).execute();
```

### 6. Use Composite Sort Keys

Combine multiple attributes in sort keys for hierarchical queries:

```typescript
// Can query:
// - All items in POST#123
// - All comments: POST#123 beginsWith COMMENT#
// - All reactions: POST#123 beginsWith REACTION#
SK: 'COMMENT#${commentId}';
SK: 'REACTION#${reactionId}';
SK: 'METADATA';
```

## Anti-Patterns to Avoid

### Don't Use Scan for Common Queries

```typescript
// ❌ Bad - full table scan
const posts = await table.entities.Post.scan()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();

// ✅ Good - efficient query
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();
```

### Don't Create Too Many GSIs

Each GSI doubles your write costs. Design carefully:

```typescript
// ❌ Bad - too many GSIs
indexes: {
  primary: { hash: "PK", sort: "SK" },
  gsi1: { /* ... */ },
  gsi2: { /* ... */ },
  gsi3: { /* ... */ },
  gsi4: { /* ... */ },
  gsi5: { /* ... */ },
}

// ✅ Good - minimal GSIs with composite keys
indexes: {
  primary: { hash: "PK", sort: "SK" },
  gsi1: { hash: "GSI1PK", sort: "GSI1SK" },  // Handles multiple patterns
}
```

### Don't Ignore Hot Partitions

Distribute writes across partition keys:

```typescript
// ❌ Bad - all writes to same partition
PK: 'GLOBAL#POSTS';
SK: 'POST#${postId}';

// ✅ Good - distributed partitions
PK: 'USER#${username}';
SK: 'POST#${postId}';
```

## Migration from Multi-Table

If you're migrating from multiple tables:

1. **Map Your Access Patterns**: List all current queries
2. **Design Generic Keys**: Create PK/SK structure
3. **Add Entity Prefixes**: Namespace each entity type
4. **Plan GSIs**: Design for alternative access patterns
5. **Test Incrementally**: Migrate one entity at a time

## Real-World Example: E-Commerce

```typescript
// Customer
PK: 'CUSTOMER#${customerId}';
SK: 'CUSTOMER#${customerId}';

// Orders by customer
PK: 'CUSTOMER#${customerId}';
SK: 'ORDER#${orderId}';

// Order items
PK: 'ORDER#${orderId}';
SK: 'ITEM#${productId}';

// Products
PK: 'PRODUCT#${productId}';
SK: 'PRODUCT#${productId}';

// Inventory by location
PK: 'PRODUCT#${productId}';
SK: 'INVENTORY#${location}';
```

## Next Steps

- **[Data Modeling](./data-modeling)** - Learn detailed modeling techniques
- **[Queries](./queries)** - Master query patterns
- **[Examples](../examples/blog-system)** - See complete implementations
