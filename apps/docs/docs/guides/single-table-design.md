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
    hash: "pk",   // Not "userId" or "customerId"
    sort: "sk"    // Generic for all entities
  }
}
```

### Entity Prefixes

Use prefixes to namespace different entity types:

```typescript
User: {
  key: {
    pk: { type: String, value: "USER#${username}" },
    sk: { type: String, value: "USER#${username}" }
  }
}

Post: {
  key: {
    pk: { type: String, value: "USER#${username}" },
    sk: { type: String, value: "POST#${postId}" }
  }
}

Comment: {
  key: {
    pk: { type: String, value: "POST#${postId}" },
    sk: { type: String, value: "COMMENT#${commentId}" }
  }
}
```

## Access Patterns

Design your keys based on how you'll query your data.

### Pattern 1: One-to-Many Relationships

Store related entities together using the same partition key:

```typescript
// User entity
pk: 'USER#alice';
sk: 'USER#alice';

// User's posts
pk: 'USER#alice';
sk: 'POST#01HMQ...';
sk: 'POST#01HMR...';
sk: 'POST#01HMS...';
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
pk: 'POST#123';
sk: 'POST#123';

// Comments on post
pk: 'POST#123';
sk: 'COMMENT#01HMQ...';
sk: 'COMMENT#01HMR...';

// Reactions to comment
pk: 'POST#123';
sk: 'COMMENT#01HMQ...#REACTION#01HMS...';
```

### Pattern 3: Many-to-Many Relationships

Use join entities to model many-to-many:

```typescript
// User
pk: 'USER#alice';
sk: 'USER#alice';

// Group
pk: 'GROUP#developers';
sk: 'GROUP#developers';

// Membership (User → Group)
pk: 'USER#alice';
sk: 'MEMBER#GROUP#developers';

// Membership (Group → User)
pk: 'GROUP#developers';
sk: 'MEMBER#USER#alice';
```

## Complete Example: Blog System

Let's build a blog with users, posts, comments, and tags:

```typescript
const BlogSchema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',

  indexes: {
    primary: {
      hash: 'pk',
      sort: 'sk',
    },
    gsi1: {
      hash: 'gsi1pk',
      sort: 'gsi1sk',
    },
  },

  models: {
    // User profile
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

    // Posts by user
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

        // GSI for querying all posts by status
        gsi1pk: { type: String, value: 'POST' },
        gsi1sk: { type: String, value: 'STATUS#${published}#${postId}' },
      },
    },

    // Comments on posts
    Comment: {
      key: {
        pk: { type: String, value: 'POST#${postId}' },
        sk: { type: String, value: 'COMMENT#${commentId}' },
      },
      attributes: {
        postId: { type: String, required: true },
        commentId: { type: String, generate: 'ulid' },
        username: { type: String, required: true },
        content: { type: String, required: true },

        // GSI for querying comments by user
        gsi1pk: { type: String, value: 'USER#${username}' },
        gsi1sk: { type: String, value: 'COMMENT#${commentId}' },
      },
    },

    // Tags for posts (many-to-many)
    PostTag: {
      key: {
        pk: { type: String, value: 'POST#${postId}' },
        sk: { type: String, value: 'TAG#${tag}' },
      },
      attributes: {
        postId: { type: String, required: true },
        tag: { type: String, required: true },

        // GSI for reverse lookup (tag → posts)
        gsi1pk: { type: String, value: 'TAG#${tag}' },
        gsi1sk: { type: String, value: 'POST#${postId}' },
      },
    },
  },

  params: {
    timestamps: true,
    isoDates: true,
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
    op.and(op.eq(attr.gsi1pk, 'POST'), op.beginsWith(attr.gsi1sk, 'STATUS#true'))
  )
  .useIndex('gsi1')
  .execute();
```

#### 5. Get all comments by a user (using GSI)

```typescript
const userComments = await table.entities.Comment.query()
  .where((attr, op) => op.eq(attr.gsi1pk, 'USER#alice'))
  .useIndex('gsi1')
  .execute();
```

#### 6. Get all posts with a tag (using GSI)

```typescript
const postsWithTag = await table.entities.PostTag.query()
  .where((attr, op) => op.eq(attr.gsi1pk, 'TAG#typescript'))
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
pk: 'USER#${username}';
pk: 'POST#${postId}';
pk: 'COMMENT#${commentId}';

// Bad - inconsistent
pk: '${username}';
pk: 'post_${postId}';
pk: 'Comment-${commentId}';
```

### 3. Leverage Sort Key Ordering

DynamoDB sorts items by sort key. Use this for natural ordering:

```typescript
// Time-sorted posts (ULID sorts by time)
sk: 'POST#${postId}'; // ULID auto-sorts by creation time

// Explicitly sorted
sk: 'POST#${createdAt}#${postId}';

// Status and time
sk: 'STATUS#${published}#${createdAt}';
```

### 4. Design GSIs for Alternative Access Patterns

Use GSIs for queries that can't use the primary key:

```typescript
// Primary: Query posts by user
pk: 'USER#alice';
sk: 'POST#${postId}';

// GSI1: Query posts by status
gsi1pk: 'POST';
gsi1sk: 'STATUS#${published}#${createdAt}';

// GSI2: Query posts by tag
gsi2pk: 'TAG#${tag}';
gsi2sk: 'POST#${postId}';
```

### 5. Handle Many-to-Many with Dual Writes

For many-to-many, write join records in both directions:

```typescript
await table
  .transactWrite()
  .addPut(
    table.entities.PostTag.put({
      postId: '123',
      tag: 'typescript',
    }).dbParams()
  )
  .addPut(
    table.entities.PostTag.put({
      postId: '123',
      tag: 'typescript',
      // Swap for reverse lookup
      gsi1pk: 'TAG#typescript',
      gsi1sk: 'POST#123',
    }).dbParams()
  )
  .execute();
```

### 6. Use Composite Sort Keys

Combine multiple attributes in sort keys for hierarchical queries:

```typescript
// Can query:
// - All items in POST#123
// - All comments: POST#123 beginsWith COMMENT#
// - All reactions: POST#123 beginsWith REACTION#
sk: 'COMMENT#${commentId}';
sk: 'REACTION#${reactionId}';
sk: 'METADATA';
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
  primary: { hash: "pk", sort: "sk" },
  gsi1: { /* ... */ },
  gsi2: { /* ... */ },
  gsi3: { /* ... */ },
  gsi4: { /* ... */ },
  gsi5: { /* ... */ },
}

// ✅ Good - minimal GSIs with composite keys
indexes: {
  primary: { hash: "pk", sort: "sk" },
  gsi1: { hash: "gsi1pk", sort: "gsi1sk" },  // Handles multiple patterns
}
```

### Don't Ignore Hot Partitions

Distribute writes across partition keys:

```typescript
// ❌ Bad - all writes to same partition
pk: 'GLOBAL#POSTS';
sk: 'POST#${postId}';

// ✅ Good - distributed partitions
pk: 'USER#${username}';
sk: 'POST#${postId}';
```

## Migration from Multi-Table

If you're migrating from multiple tables:

1. **Map Your Access Patterns**: List all current queries
2. **Design Generic Keys**: Create pk/sk structure
3. **Add Entity Prefixes**: Namespace each entity type
4. **Plan GSIs**: Design for alternative access patterns
5. **Test Incrementally**: Migrate one entity at a time

## Real-World Example: E-Commerce

```typescript
// Customer
pk: 'CUSTOMER#${customerId}';
sk: 'CUSTOMER#${customerId}';

// Orders by customer
pk: 'CUSTOMER#${customerId}';
sk: 'ORDER#${orderId}';

// Order items
pk: 'ORDER#${orderId}';
sk: 'ITEM#${productId}';

// Products
pk: 'PRODUCT#${productId}';
sk: 'PRODUCT#${productId}';

// Inventory by location
pk: 'PRODUCT#${productId}';
sk: 'INVENTORY#${location}';
```

## Next Steps

- **[Data Modeling](./data-modeling)** - Learn detailed modeling techniques
- **[Queries](./queries)** - Master query patterns
- **[Examples](../examples/blog-system)** - See complete implementations
