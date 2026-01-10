---
sidebar_position: 4
---

# Mutations

Learn how to create, update, and delete data in DynamoDB using Dynatable's type-safe mutation operations.

## Put (Create/Replace)

The `put` operation creates a new item or replaces an existing one.

### Basic Put

```typescript
const user = await table.entities.User.put({
  username: 'alice',
  name: 'Alice Smith',
  email: 'alice@example.com',
  bio: 'Software engineer',
}).execute();

console.log(user);
// {
//   username: 'alice',
//   name: 'Alice Smith',
//   email: 'alice@example.com',
//   bio: 'Software engineer',
//   createdAt: 2024-01-15T10:00:00.000Z,
//   updatedAt: 2024-01-15T10:00:00.000Z
// }
```

### Put with Auto-Generated ID

```typescript
const post = await table.entities.Post.put({
  username: 'alice',
  title: 'My First Post',
  content: 'Hello, World!',
}).execute();

console.log(post.postId); // Auto-generated ULID
```

### Put with Defaults

```typescript
// Schema with defaults
Post: {
  attributes: {
    username: { type: String, required: true },
    title: { type: String, required: true },
    published: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
  }
}

// Put without specifying defaults
const post = await table.entities.Post.put({
  username: 'alice',
  title: 'My Post',
}).execute();

console.log(post.published);  // false (default)
console.log(post.views);      // 0 (default)
```

### Conditional Put

Only create if item doesn't exist:

```typescript
await table.entities.User.put({
  username: 'alice',
  name: 'Alice Smith',
  email: 'alice@example.com',
})
  .ifNotExists()
  .execute();
```

Custom condition:

```typescript
await table.entities.User.put({
  username: 'alice',
  name: 'Alice Updated',
  email: 'alice@example.com',
})
  .where((attr, op) => op.eq(attr.version, 1))
  .execute();
```

## Update

The `update` operation modifies specific attributes of an existing item.

### Set Attributes

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .set('name', 'Alice Johnson')
  .set('bio', 'Senior software engineer')
  .execute();
```

Multiple sets:

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .set('name', 'Alice Johnson')
  .set('email', 'alice.johnson@example.com')
  .set('bio', 'Senior engineer')
  .execute();
```

### Add (Increment/Decrement)

Increment a number:

```typescript
await table.entities.Post.update({
  username: 'alice',
  postId: 'post123',
})
  .add('views', 1)
  .execute();
```

Decrement:

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .add('credits', -10)
  .execute();
```

Add to a set:

```typescript
await table.entities.Post.update({
  username: 'alice',
  postId: 'post123',
})
  .add('tags', new Set(['typescript', 'tutorial']))
  .execute();
```

### Remove Attributes

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .remove('bio')
  .remove('website')
  .execute();
```

### Delete from Set

```typescript
await table.entities.Post.update({
  username: 'alice',
  postId: 'post123',
})
  .delete('tags', new Set(['outdated']))
  .execute();
```

### Combined Operations

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .set('name', 'Alice Johnson')
  .add('loginCount', 1)
  .remove('temporaryFlag')
  .execute();
```

### Conditional Update

Update only if condition is met:

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .set('name', 'Alice Johnson')
  .where((attr, op) => op.eq(attr.status, 'active'))
  .execute();
```

Multiple conditions:

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .set('role', 'admin')
  .where((attr, op) => op.and(op.eq(attr.isVerified, true), op.gt(attr.loginCount, 100)))
  .execute();
```

### Return Values

Get the updated item:

```typescript
const updated = await table.entities.User.update({
  username: 'alice',
})
  .set('name', 'Alice Johnson')
  .returning('ALL_NEW')
  .execute();

console.log(updated); // Complete updated item
```

**Return options:**

- `NONE`: Don't return anything (default)
- `ALL_OLD`: Return item before update
- `ALL_NEW`: Return item after update
- `UPDATED_OLD`: Return only updated attributes (old values)
- `UPDATED_NEW`: Return only updated attributes (new values)

```typescript
// Get old values
const old = await table.entities.User.update({
  username: 'alice',
})
  .set('name', 'Alice Johnson')
  .returning('ALL_OLD')
  .execute();

// Get only what changed
const changes = await table.entities.User.update({
  username: 'alice',
})
  .set('name', 'Alice Johnson')
  .set('email', 'alice.j@example.com')
  .returning('UPDATED_NEW')
  .execute();
```

## Delete

The `delete` operation removes an item from the table.

### Basic Delete

```typescript
await table.entities.User.delete({
  username: 'alice',
}).execute();
```

With composite key:

```typescript
await table.entities.Post.delete({
  username: 'alice',
  postId: 'post123',
}).execute();
```

### Conditional Delete

Delete only if condition is met:

```typescript
await table.entities.User.delete({
  username: 'alice',
})
  .where((attr, op) => op.eq(attr.status, 'inactive'))
  .execute();
```

Multiple conditions:

```typescript
await table.entities.Post.delete({
  username: 'alice',
  postId: 'post123',
})
  .where((attr, op) => op.and(op.eq(attr.published, false), op.lt(attr.views, 10)))
  .execute();
```

### Return Deleted Item

```typescript
const deleted = await table.entities.User.delete({
  username: 'alice',
})
  .returning('ALL_OLD')
  .execute();

console.log(deleted); // The deleted item
```

### Soft Delete

Instead of deleting, mark as deleted:

```typescript
await table.entities.User.update({
  username: 'alice',
})
  .set('isDeleted', true)
  .set('deletedAt', new Date())
  .execute();
```

## Batch Write

Perform multiple put/delete operations in a single request.

### Batch Put

```typescript
await table.entities.User.batchWrite([
  { username: 'alice', name: 'Alice', email: 'alice@example.com' },
  { username: 'bob', name: 'Bob', email: 'bob@example.com' },
  { username: 'charlie', name: 'Charlie', email: 'charlie@example.com' },
]).execute();
```

### Batch Delete

```typescript
await table.entities.Post.batchDelete([
  { username: 'alice', postId: 'post1' },
  { username: 'alice', postId: 'post2' },
  { username: 'alice', postId: 'post3' },
]).execute();
```

### Mixed Batch Operations

```typescript
// Note: Use DynamoDB's batchWrite directly for mixed operations
await table
  .batchWrite()
  .addPut(
    table.entities.User.put({
      username: 'alice',
      name: 'Alice',
    }).dbParams()
  )
  .addDelete(
    table.entities.Post.delete({
      username: 'bob',
      postId: 'post1',
    }).dbParams()
  )
  .execute();
```

:::note
Batch operations:

- Max 25 items per request
- Max 16 MB total data
- No conditional operations
- Partial failures possible
  :::

## Transactions

Perform atomic operations across multiple items.

### Transact Write

Atomic create/update/delete:

```typescript
await table
  .transactWrite()
  .addPut(
    table.entities.User.put({
      username: 'alice',
      name: 'Alice Smith',
      email: 'alice@example.com',
    }).dbParams()
  )
  .addUpdate(
    table.entities.User.update({
      username: 'bob',
    })
      .add('followerCount', 1)
      .dbParams()
  )
  .addDelete(
    table.entities.Post.delete({
      username: 'charlie',
      postId: 'post123',
    }).dbParams()
  )
  .execute();
```

### Transaction with Conditions

All operations must succeed or all fail:

```typescript
await table
  .transactWrite()
  .addPut(
    table.entities.Post.put({
      username: 'alice',
      title: 'New Post',
      content: 'Content...',
    }).dbParams()
  )
  .addUpdate(
    table.entities.User.update({
      username: 'alice',
    })
      .add('postCount', 1)
      .where((attr, op) => op.lt(attr.postCount, 100))
      .dbParams()
  )
  .execute();
```

### Complex Transaction

```typescript
// Transfer credits between users atomically
await table
  .transactWrite()
  .addUpdate(
    table.entities.User.update({
      username: 'alice',
    })
      .add('credits', -100)
      .where((attr, op) => op.gte(attr.credits, 100))
      .dbParams()
  )
  .addUpdate(
    table.entities.User.update({
      username: 'bob',
    })
      .add('credits', 100)
      .dbParams()
  )
  .execute();
```

:::note
Transactions:

- Max 100 items per transaction
- Max 4 MB total data
- All succeed or all fail (atomic)
- Higher cost than individual operations
  :::

## Optimistic Locking

Prevent concurrent update conflicts using version numbers:

```typescript
// 1. Read current version
const user = await table.entities.User.get({
  username: 'alice',
}).execute();

const currentVersion = user.version;

// 2. Update with version check
try {
  await table.entities.User.update({
    username: 'alice',
  })
    .set('name', 'Alice Updated')
    .add('version', 1)
    .where((attr, op) => op.eq(attr.version, currentVersion))
    .execute();
} catch (error) {
  // Version mismatch - someone else updated it
  console.error('Concurrent update detected');
}
```

## Timestamps

With `timestamps: true` in schema, Dynatable automatically manages:

- `createdAt`: Set once on creation
- `updatedAt`: Updated on every put/update

```typescript
// Put - sets both timestamps
const user = await table.entities.User.put({
  username: 'alice',
  name: 'Alice Smith',
}).execute();

console.log(user.createdAt); // 2024-01-15T10:00:00.000Z
console.log(user.updatedAt); // 2024-01-15T10:00:00.000Z

// Update - only updates updatedAt
await table.entities.User.update({
  username: 'alice',
})
  .set('name', 'Alice Johnson')
  .execute();

// createdAt unchanged, updatedAt updated
```

## Error Handling

### Conditional Check Failures

```typescript
try {
  await table.entities.User.put({
    username: 'alice',
    name: 'Alice',
  })
    .ifNotExists()
    .execute();
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    console.error('User already exists');
  }
}
```

### Validation Errors

```typescript
try {
  await table.entities.User.put({
    username: 'alice',
    email: 'not-an-email', // Invalid
  }).execute();
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

### Transaction Failures

```typescript
try {
  await table.transactWrite().addUpdate(/* ... */).addUpdate(/* ... */).execute();
} catch (error) {
  if (error.name === 'TransactionCanceledException') {
    console.error('Transaction failed');
    // All operations rolled back
  }
}
```

## Best Practices

### 1. Use Update Instead of Get + Put

```typescript
// ❌ Bad - two operations
const user = await table.entities.User.get({ username: 'alice' }).execute();
user.loginCount += 1;
await table.entities.User.put(user).execute();

// ✅ Good - single atomic operation
await table.entities.User.update({ username: 'alice' }).add('loginCount', 1).execute();
```

### 2. Use Transactions for Related Updates

```typescript
// ✅ Good - atomic
await table
  .transactWrite()
  .addPut(
    table.entities.Post.put({
      username: 'alice',
      title: 'New Post',
    }).dbParams()
  )
  .addUpdate(table.entities.User.update({ username: 'alice' }).add('postCount', 1).dbParams())
  .execute();
```

### 3. Use Batch for Multiple Independent Operations

```typescript
// ✅ Good - batch write
await table.entities.User.batchWrite([
  { username: 'alice', name: 'Alice' },
  { username: 'bob', name: 'Bob' },
  { username: 'charlie', name: 'Charlie' },
]).execute();

// ❌ Bad - multiple individual writes
await table.entities.User.put({ username: 'alice', name: 'Alice' }).execute();
await table.entities.User.put({ username: 'bob', name: 'Bob' }).execute();
await table.entities.User.put({
  username: 'charlie',
  name: 'Charlie',
}).execute();
```

### 4. Implement Soft Deletes for Important Data

```typescript
// ✅ Good - soft delete (recoverable)
await table.entities.User.update({ username: 'alice' })
  .set('isDeleted', true)
  .set('deletedAt', new Date())
  .execute();

// ❌ Risky - hard delete (permanent)
await table.entities.User.delete({ username: 'alice' }).execute();
```

### 5. Use Conditional Writes

```typescript
// ✅ Good - prevent overwriting
await table.entities.User.put({
  username: 'alice',
  name: 'Alice',
})
  .ifNotExists()
  .execute();

// ❌ Bad - might overwrite existing data
await table.entities.User.put({
  username: 'alice',
  name: 'Alice',
}).execute();
```

### 6. Handle Errors Appropriately

```typescript
try {
  await table.entities.User.update({ username: 'alice' })
    .set('name', 'Alice Johnson')
    .where((attr, op) => op.eq(attr.version, currentVersion))
    .execute();
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    // Retry with fresh data
    const user = await table.entities.User.get({ username: 'alice' }).execute();
    // Handle optimistic lock failure
  } else {
    throw error;
  }
}
```

## Common Patterns

### Counter

```typescript
await table.entities.Post.update({
  username: 'alice',
  postId: 'post123',
})
  .add('views', 1)
  .execute();
```

### Toggle Boolean

```typescript
const user = await table.entities.User.get({ username: 'alice' }).execute();

await table.entities.User.update({ username: 'alice' }).set('isActive', !user.isActive).execute();
```

### Append to List

```typescript
const user = await table.entities.User.get({ username: 'alice' }).execute();

await table.entities.User.update({ username: 'alice' })
  .set('loginHistory', [...(user.loginHistory || []), new Date()])
  .execute();
```

### Upsert (Put with defaults)

```typescript
await table.entities.User.put({
  username: 'alice',
  name: 'Alice Smith',
  email: 'alice@example.com',
  loginCount: 1,
}).execute();

// If exists, it replaces
// If not, it creates with defaults
```

## Next Steps

- **[Queries](./queries)** - Learn how to retrieve your data
- **[Examples](../examples/blog-system)** - See complete CRUD examples
