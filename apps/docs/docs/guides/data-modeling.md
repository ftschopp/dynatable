---
sidebar_position: 2
---

# Data Modeling

Learn how to design effective data models with Dynatable. This guide covers entity design, relationships, validation, and best practices.

## Entity Design

### Basic Entity

A simple entity with required and optional attributes:

```typescript
User: {
  key: {
    pk: { type: String, value: "USER#${userId}" },
    sk: { type: String, value: "USER#${userId}" },
  },
  attributes: {
    userId: { type: String, generate: "ulid" },
    email: { type: String, required: true },
    name: { type: String, required: true },
    bio: { type: String },  // Optional
    age: { type: Number },   // Optional
  },
}
```

### Attributes with Defaults

Set default values for attributes:

```typescript
User: {
  attributes: {
    username: { type: String, required: true },
    role: { type: String, default: "user" },
    status: { type: String, default: "active" },
    score: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date() },
  },
}
```

### Auto-Generated IDs

Use ULID or UUID for auto-generated identifiers:

```typescript
Post: {
  attributes: {
    // ULID - sortable by time, recommended
    postId: { type: String, generate: "ulid" },

    // UUID - random, not sortable
    // uuid: { type: String, generate: "uuid" },
  },
}
```

**When to use ULID:**

- You need time-based sorting
- You want URL-safe IDs
- Most common use case

**When to use UUID:**

- Pure randomness required
- No sorting needed
- Legacy system compatibility

## Relationships

### One-to-One

Model one-to-one by embedding data or using the same keys:

**Embedded (Recommended):**

```typescript
User: {
  key: {
    pk: { type: String, value: "USER#${userId}" },
    sk: { type: String, value: "USER#${userId}" },
  },
  attributes: {
    userId: { type: String, generate: "ulid" },
    name: { type: String, required: true },
    // Embedded profile
    profileImage: { type: String },
    bio: { type: String },
    website: { type: String },
  },
}
```

**Separate Entity (for large attributes):**

```typescript
User: {
  key: {
    pk: { type: String, value: "USER#${userId}" },
    sk: { type: String, value: "USER#${userId}" },
  },
  attributes: {
    userId: { type: String, generate: "ulid" },
    name: { type: String, required: true },
  },
}

UserProfile: {
  key: {
    pk: { type: String, value: "USER#${userId}" },
    sk: { type: String, value: "PROFILE" },
  },
  attributes: {
    userId: { type: String, required: true },
    bio: { type: String },
    preferences: { type: Object },
    metadata: { type: Object },
  },
}
```

### One-to-Many

Store child entities with parent's partition key:

```typescript
// Parent
User: {
  key: {
    pk: { type: String, value: "USER#${username}" },
    sk: { type: String, value: "USER#${username}" },
  },
}

// Children
Post: {
  key: {
    pk: { type: String, value: "USER#${username}" },
    sk: { type: String, value: "POST#${postId}" },
  },
  attributes: {
    username: { type: String, required: true },
    postId: { type: String, generate: "ulid" },
    title: { type: String, required: true },
  },
}

// Query all posts by user
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();
```

### Many-to-Many

Use junction entities for many-to-many relationships:

```typescript
// User entity
User: {
  key: {
    pk: { type: String, value: "USER#${userId}" },
    sk: { type: String, value: "USER#${userId}" },
  },
}

// Group entity
Group: {
  key: {
    pk: { type: String, value: "GROUP#${groupId}" },
    sk: { type: String, value: "GROUP#${groupId}" },
  },
}

// Junction entity
UserGroup: {
  key: {
    pk: { type: String, value: "USER#${userId}" },
    sk: { type: String, value: "GROUP#${groupId}" },
  },
  attributes: {
    userId: { type: String, required: true },
    groupId: { type: String, required: true },
    role: { type: String, default: "member" },
    joinedAt: { type: Date },

    // GSI for reverse lookup (Group → Users)
    gsi1pk: { type: String, value: "GROUP#${groupId}" },
    gsi1sk: { type: String, value: "USER#${userId}" },
  },
}

// Get all groups for a user
const userGroups = await table.entities.UserGroup.query()
  .where((attr, op) => op.eq(attr.userId, 'user123'))
  .execute();

// Get all users in a group (using GSI)
const groupUsers = await table.entities.UserGroup.query()
  .where((attr, op) => op.eq(attr.gsi1pk, 'GROUP#group456'))
  .useIndex('gsi1')
  .execute();
```

## Complex Attributes

### Arrays

Store lists of simple values:

```typescript
Post: {
  attributes: {
    title: { type: String, required: true },
    tags: { type: Array },           // Array of any type
    categories: { type: Array },     // ["tech", "programming"]
    views: { type: Array },          // [100, 200, 150]
  },
}

// Usage
await table.entities.Post.put({
  title: "My Post",
  tags: ["javascript", "typescript", "react"],
  categories: ["programming", "tutorial"],
}).execute();
```

### Objects

Store complex nested data:

```typescript
User: {
  attributes: {
    username: { type: String, required: true },
    metadata: { type: Object },
    settings: { type: Object },
    address: { type: Object },
  },
}

// Usage
await table.entities.User.put({
  username: "alice",
  metadata: {
    lastLogin: new Date(),
    loginCount: 42,
    preferences: {
      theme: "dark",
      language: "en"
    }
  },
  address: {
    street: "123 Main St",
    city: "New York",
    country: "USA",
    zipCode: "10001"
  }
}).execute();
```

### Sets

DynamoDB native sets for unique values:

```typescript
Post: {
  attributes: {
    title: { type: String, required: true },

    // String set
    tags: {
      type: Set,
      items: String
    },

    // Number set
    relatedPostIds: {
      type: Set,
      items: Number
    },
  },
}

// Usage
await table.entities.Post.put({
  title: "My Post",
  tags: new Set(["javascript", "typescript"]),
  relatedPostIds: new Set([1, 2, 3]),
}).execute();
```

## Validation

Dynatable uses Zod for runtime validation.

### Type Validation

Automatic type checking:

```typescript
// ❌ This will fail
await table.entities.User.put({
  username: 'alice',
  age: '25', // Error: Expected number, got string
}).execute();

// ✅ This works
await table.entities.User.put({
  username: 'alice',
  age: 25,
}).execute();
```

### Required Fields

```typescript
User: {
  attributes: {
    username: { type: String, required: true },
    email: { type: String, required: true },
    bio: { type: String },  // Optional
  },
}

// ❌ This will fail - missing required field
await table.entities.User.put({
  username: "alice",
  // Missing email
}).execute();
```

### Custom Validation

For complex validation, use Zod directly:

```typescript
import { z } from 'zod';

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/);

// Validate before putting
const email = emailSchema.parse(userInput.email);
const password = passwordSchema.parse(userInput.password);

await table.entities.User.put({
  username: 'alice',
  email,
  // Store hashed password, not plain text
}).execute();
```

## Timestamps

Enable automatic timestamp management:

```typescript
// In schema
params: {
  timestamps: true;
}

// All entities automatically get:
// - createdAt: Set on creation
// - updatedAt: Updated on every modification

const user = await table.entities.User.put({
  username: 'alice',
  name: 'Alice Smith',
}).execute();

console.log(user.createdAt); // 2024-01-15T10:00:00.000Z
console.log(user.updatedAt); // 2024-01-15T10:00:00.000Z

// After update
await table.entities.User.update({ username: 'alice' }).set('name', 'Alice Johnson').execute();

// updatedAt is automatically changed, createdAt stays the same
```

## Versioning

Implement optimistic locking with version fields:

```typescript
User: {
  attributes: {
    username: { type: String, required: true },
    name: { type: String, required: true },
    version: { type: Number, default: 0 },
  },
}

// Update with version check
await table.entities.User.update({ username: "alice" })
  .set("name", "Alice Johnson")
  .add("version", 1)
  .where((attr, op) => op.eq(attr.version, currentVersion))
  .execute();
```

## Soft Deletes

Implement soft deletes instead of hard deletes:

```typescript
User: {
  attributes: {
    username: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
}

// Soft delete
await table.entities.User.update({ username: "alice" })
  .set("isDeleted", true)
  .set("deletedAt", new Date())
  .execute();

// Query only active users
const activeUsers = await table.entities.User.scan()
  .where((attr, op) => op.eq(attr.isDeleted, false))
  .execute();
```

## Computed Attributes

Use GSI keys for computed values:

```typescript
Post: {
  key: {
    pk: { type: String, value: "USER#${username}" },
    sk: { type: String, value: "POST#${postId}" },
  },
  attributes: {
    username: { type: String, required: true },
    postId: { type: String, generate: "ulid" },
    title: { type: String, required: true },
    published: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },

    // Computed attribute for querying
    gsi1pk: { type: String, value: "POST" },
    gsi1sk: {
      type: String,
      // Combines multiple attributes for efficient querying
      value: "${published}#${featured}#${postId}"
    },
  },
}

// Query published, featured posts
const featuredPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.gsi1pk, "POST"),
      op.beginsWith(attr.gsi1sk, "true#true")
    )
  )
  .useIndex('gsi1')
  .execute();
```

## Best Practices

### 1. Keep Entities Focused

```typescript
// ✅ Good - focused entities
User: {
  attributes: {
    username: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
  },
}

UserSettings: {
  attributes: {
    username: { type: String, required: true },
    theme: { type: String, default: "light" },
    notifications: { type: Boolean, default: true },
  },
}

// ❌ Bad - too many unrelated attributes
User: {
  attributes: {
    username: { type: String },
    name: { type: String },
    email: { type: String },
    lastLoginIp: { type: String },
    favoriteColor: { type: String },
    shoeSize: { type: Number },
    // ... 50 more attributes
  },
}
```

### 2. Use Appropriate Types

```typescript
// ✅ Good - correct types
User: {
  attributes: {
    age: { type: Number },
    isActive: { type: Boolean },
    createdAt: { type: Date },
    tags: { type: Array },
  },
}

// ❌ Bad - wrong types
User: {
  attributes: {
    age: { type: String },        // Should be Number
    isActive: { type: String },   // Should be Boolean
    createdAt: { type: String },  // Should be Date
  },
}
```

### 3. Plan for Growth

Design your schema to accommodate future needs:

```typescript
// ✅ Good - flexible metadata
User: {
  attributes: {
    username: { type: String, required: true },
    metadata: { type: Object },  // Can add fields without schema changes
  },
}

// Use metadata for experimental features
await table.entities.User.update({ username: "alice" })
  .set("metadata", {
    betaFeatures: ["feature1", "feature2"],
    experimentGroup: "A",
  })
  .execute();
```

### 4. Avoid Over-Normalization

DynamoDB isn't a relational database. Denormalization is often better:

```typescript
// ✅ Good - denormalized for performance
Comment: {
  attributes: {
    commentId: { type: String, generate: "ulid" },
    postId: { type: String, required: true },
    username: { type: String, required: true },
    content: { type: String, required: true },
    // Denormalized for display
    authorName: { type: String },
    authorAvatar: { type: String },
  },
}

// ❌ Bad - over-normalized, requires multiple queries
Comment: {
  attributes: {
    commentId: { type: String, generate: "ulid" },
    postId: { type: String, required: true },
    userId: { type: String, required: true },  // Need separate query for user data
    content: { type: String, required: true },
  },
}
```

### 5. Use Sensible Defaults

```typescript
User: {
  attributes: {
    role: { type: String, default: "user" },
    status: { type: String, default: "active" },
    score: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
  },
}
```

## Next Steps

- **[Single Table Design](./single-table-design)** - Learn advanced table patterns
- **[Queries](./queries)** - Master data retrieval
- **[Mutations](./mutations)** - Learn create, update, and delete operations
