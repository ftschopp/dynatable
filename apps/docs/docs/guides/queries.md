---
sidebar_position: 3
---

# Queries

Learn how to retrieve data from DynamoDB using Dynatable's type-safe query and scan operations.

## Query vs Scan

### Query

Efficient, targeted data retrieval using partition key:

```typescript
// ✅ Fast - uses partition key
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();
```

**When to use:**

- You know the partition key
- Need fast, efficient retrieval
- Working with large tables
- Cost efficiency matters

### Scan

Full table scan, examines every item:

```typescript
// ⚠️ Slow - scans entire table
const activeUsers = await table.entities.User.scan()
  .where((attr, op) => op.eq(attr.isActive, true))
  .execute();
```

**When to use:**

- Small tables only
- Batch processing
- Analytics (use sparingly)
- No partition key available

:::warning
Avoid Scan on large tables. It's slow and expensive. Design your schema to use Query instead.
:::

## Basic Query

### Get Item by Key

Retrieve a single item by its primary key:

```typescript
const user = await table.entities.User.get({
  username: 'alice',
}).execute();

if (user) {
  console.log(user.name);
}
```

For composite keys:

```typescript
const post = await table.entities.Post.get({
  username: 'alice',
  postId: '01HMQ7X8Y2K3N4M5P6Q7R8S9T0',
}).execute();
```

### Query by Partition Key

Get all items with a specific partition key:

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();

console.log(posts.length); // Number of posts
posts.forEach((post) => {
  console.log(post.title);
});
```

## Filter Conditions

### Equality

```typescript
// Exact match
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();
```

### Comparison Operators

```typescript
// Greater than
const recentPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.username, 'alice'), op.gt(attr.createdAt, new Date('2024-01-01')))
  )
  .execute();

// Less than
const oldPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.username, 'alice'), op.lt(attr.createdAt, new Date('2023-01-01')))
  )
  .execute();

// Greater than or equal
const posts = await table.entities.Post.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.gte(attr.views, 100)))
  .execute();

// Less than or equal
const posts = await table.entities.Post.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.lte(attr.views, 1000)))
  .execute();
```

### Between

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.between(attr.views, 100, 1000)))
  .execute();
```

### Begins With

Useful for hierarchical data:

```typescript
// All posts (sort key starts with POST#)
const posts = await table.entities.Post.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.beginsWith(attr.sk, 'POST#')))
  .execute();

// Posts from January 2024
const janPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.username, 'alice'), op.beginsWith(attr.createdAt, '2024-01'))
  )
  .execute();
```

### Contains

Check if an attribute contains a substring:

```typescript
const posts = await table.entities.Post.scan()
  .where((attr, op) => op.contains(attr.content, 'typescript'))
  .execute();
```

:::note
`contains` only works with Scan, not Query.
:::

## Logical Operators

### AND

Combine multiple conditions:

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.username, 'alice'), op.eq(attr.published, true), op.gt(attr.views, 100))
  )
  .execute();
```

### OR

Match any condition:

```typescript
const posts = await table.entities.Post.scan()
  .where((attr, op) => op.or(op.eq(attr.status, 'published'), op.eq(attr.status, 'featured')))
  .execute();
```

### NOT

Negate a condition:

```typescript
const posts = await table.entities.Post.scan()
  .where((attr, op) => op.not(op.eq(attr.published, false)))
  .execute();
```

### Complex Combinations

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'alice'),
      op.or(op.eq(attr.published, true), op.exists(attr.featured)),
      op.gt(attr.createdAt, new Date('2024-01-01'))
    )
  )
  .execute();
```

## Existence Checks

### Exists

Check if an attribute exists:

```typescript
const postsWithImages = await table.entities.Post.scan()
  .where((attr, op) => op.exists(attr.imageUrl))
  .execute();
```

### Not Exists

Check if an attribute doesn't exist:

```typescript
const postsWithoutImages = await table.entities.Post.scan()
  .where((attr, op) => op.notExists(attr.imageUrl))
  .execute();
```

## IN Operator

Check if value is in a list:

```typescript
const posts = await table.entities.Post.scan()
  .where((attr, op) => op.in(attr.status, ['draft', 'review', 'published']))
  .execute();
```

## Pagination

### Basic Pagination

```typescript
const result = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .limit(20)
  .executeWithPagination();

console.log(result.items); // Array of posts
console.log(result.lastEvaluatedKey); // Key for next page
console.log(result.count); // Number of items returned
```

### Continue from Last Key

```typescript
let allPosts = [];
let lastKey = undefined;

do {
  const result = await table.entities.Post.query()
    .where((attr, op) => op.eq(attr.username, 'alice'))
    .limit(100)
    .startFrom(lastKey)
    .executeWithPagination();

  allPosts.push(...result.items);
  lastKey = result.lastEvaluatedKey;
} while (lastKey);

console.log(`Retrieved ${allPosts.length} total posts`);
```

### Page-Based Pagination

```typescript
async function getPage(pageNumber: number, pageSize: number) {
  const result = await table.entities.Post.query()
    .where((attr, op) => op.eq(attr.username, 'alice'))
    .limit(pageSize)
    .executeWithPagination();

  return {
    items: result.items,
    nextPageToken: result.lastEvaluatedKey,
    hasMore: !!result.lastEvaluatedKey,
  };
}
```

## Sorting

### Ascending Order

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .scanIndexForward(true) // Ascending (oldest first)
  .execute();
```

### Descending Order

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .scanIndexForward(false) // Descending (newest first)
  .execute();
```

## Limiting Results

```typescript
// Get only 10 posts
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .limit(10)
  .execute();
```

## Projections

Select specific attributes to reduce data transfer:

```typescript
const users = await table.entities.User.scan().select(['username', 'name', 'email']).execute();

// Only username, name, and email are returned
```

## Consistent Reads

Use consistent reads when you need the most up-to-date data:

```typescript
const user = await table.entities.User.get({
  username: 'alice',
})
  .consistentRead()
  .execute();
```

:::warning
Consistent reads:

- Cost twice as much as eventual reads
- Not available on GSI
- Use only when necessary
  :::

## Using Indexes

### Query with GSI

```typescript
const publishedPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.gsi1pk, 'POST'), op.beginsWith(attr.gsi1sk, 'STATUS#published'))
  )
  .useIndex('gsi1')
  .execute();
```

### Query with LSI

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.gt(attr.views, 1000)))
  .useIndex('lsi1')
  .execute();
```

## Batch Get

Retrieve multiple items efficiently:

```typescript
const users = await table.entities.User.batchGet([
  { username: 'alice' },
  { username: 'bob' },
  { username: 'charlie' },
]).execute();

users.forEach((user) => {
  console.log(user.name);
});
```

:::note
BatchGet:

- Max 100 items per request
- Max 16 MB total data
- Results may be unordered
- May return partial results
  :::

## Scan Operations

### Basic Scan

```typescript
const allUsers = await table.entities.User.scan().execute();
```

### Filtered Scan

```typescript
const activeUsers = await table.entities.User.scan()
  .where((attr, op) => op.eq(attr.isActive, true))
  .execute();
```

### Parallel Scan

For large tables, use parallel scan:

```typescript
// Segment 1 of 4
const segment1 = await table.entities.User.scan().segment(0, 4).execute();

// Segment 2 of 4
const segment2 = await table.entities.User.scan().segment(1, 4).execute();

// Run in parallel
const [seg1, seg2, seg3, seg4] = await Promise.all([
  table.entities.User.scan().segment(0, 4).execute(),
  table.entities.User.scan().segment(1, 4).execute(),
  table.entities.User.scan().segment(2, 4).execute(),
  table.entities.User.scan().segment(3, 4).execute(),
]);

const allUsers = [...seg1, ...seg2, ...seg3, ...seg4];
```

## Query Patterns

### Get Latest Items

```typescript
// Using ULID (auto-sorted by time)
const latestPosts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .scanIndexForward(false) // Newest first
  .limit(10)
  .execute();
```

### Get Items in Date Range

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'alice'),
      op.between(attr.createdAt, new Date('2024-01-01'), new Date('2024-12-31'))
    )
  )
  .execute();
```

### Count Items

```typescript
const result = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .executeWithPagination();

console.log(result.count); // Number of items
```

### Check if Item Exists

```typescript
const user = await table.entities.User.get({
  username: 'alice',
}).execute();

if (user) {
  console.log('User exists');
} else {
  console.log('User not found');
}
```

## Performance Tips

### 1. Use Query over Scan

```typescript
// ✅ Fast - query with partition key
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();

// ❌ Slow - full table scan
const posts = await table.entities.Post.scan()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .execute();
```

### 2. Use Projections

```typescript
// ✅ Only fetch needed attributes
const users = await table.entities.User.scan().select(['username', 'email']).execute();

// ❌ Fetches all attributes
const users = await table.entities.User.scan().execute();
```

### 3. Limit Result Size

```typescript
// ✅ Limit to needed items
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.username, 'alice'))
  .limit(10)
  .execute();
```

### 4. Use Batch Operations

```typescript
// ✅ Single batch request
const users = await table.entities.User.batchGet([
  { username: 'alice' },
  { username: 'bob' },
  { username: 'charlie' },
]).execute();

// ❌ Three separate requests
const alice = await table.entities.User.get({ username: 'alice' }).execute();
const bob = await table.entities.User.get({ username: 'bob' }).execute();
const charlie = await table.entities.User.get({
  username: 'charlie',
}).execute();
```

### 5. Design Proper Indexes

```typescript
// ✅ Query uses index
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.gsi1pk, 'STATUS#published'))
  .useIndex('gsi1')
  .execute();

// ❌ Scan because no index
const posts = await table.entities.Post.scan()
  .where((attr, op) => op.eq(attr.published, true))
  .execute();
```

## Next Steps

- **[Mutations](./mutations)** - Learn create, update, and delete operations
- **[Examples](../examples/blog-system)** - See real-world query examples
