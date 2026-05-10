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
  .filter((attr, op) => op.eq(attr.isActive, true))
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

## Entity-type isolation in single-table designs

In single-table designs multiple entities share the same partition keys — especially on GSIs (e.g. `Airport`, `AirportPersonnel`, and `AirportResource` may all share `GSI1PK = AIRPORT#${airport}`). To make sure `entities.X.query()` and `entities.X.scan()` only return items belonging to that entity, Dynatable automatically appends a filter on a hidden `_type` attribute:

```typescript
// Issued query (simplified):
KeyConditionExpression: '#GSI1PK = :gsi1pk_0',
FilterExpression: '#_type = :_type',
ExpressionAttributeValues: {
  ':gsi1pk_0': 'AIRPORT#EZE',
  ':_type': 'AirportPersonnel', // ← auto-injected from the entity name
}
```

You don't need to add this filter yourself — every item written through `entities.X.put()` or `entities.X.batchWrite()` is stamped with `_type = 'X'`, and every `query()`/`scan()` issued through that entity matches it.

:::note
Items written outside the entity API (e.g. via the raw AWS SDK client, or imported by a migration that doesn't set `_type`) won't be returned by `entities.X.query()`/`scan()`. Backfill `_type` for those rows or query through the raw client if you need to read them.
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

When `params.timestamps: true` is enabled, `createdAt`/`updatedAt` are stored
as ISO 8601 strings. Compare them as strings — DynamoDB's lexicographic order
matches chronological order for ISO 8601:

```typescript
// Greater than (compare ISO strings)
const recentPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.username, 'alice'), op.gt(attr.createdAt, '2024-01-01T00:00:00.000Z'))
  )
  .execute();

// Less than
const oldPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.username, 'alice'), op.lt(attr.createdAt, '2023-01-01T00:00:00.000Z'))
  )
  .execute();

// Greater than or equal — numeric attributes
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

Useful for hierarchical sort-key patterns. Reference the attribute that drives
the sort-key template (Dynatable resolves it to the actual `SK` for the query):

```typescript
// Schema:
//   models.Post.key.SK = { type: String, value: 'POST#${postId}' }
//
// `beginsWith` on `postId` truncates the template at the next placeholder
// — the resulting key prefix is "POST#"
const posts = await table.entities.Post.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.beginsWith(attr.postId, '')))
  .execute();
```

For temporal filters on a non-key attribute (such as `createdAt`), use a
`FilterExpression` — note that filters run after the key match and do NOT
reduce read capacity:

```typescript
// Posts from January 2024 (filter, not key condition)
const janPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.username, 'alice'), op.beginsWith(attr.createdAt, '2024-01'))
  )
  .execute();
```

### Contains

Check if an attribute contains a substring (or item, for sets/lists):

```typescript
const posts = await table.entities.Post.scan()
  .filter((attr, op) => op.contains(attr.content, 'typescript'))
  .execute();
```

:::note
`contains` cannot be used as a key condition — DynamoDB only allows `=`,
`<`/`<=`/`>`/`>=`, `between`, and `begins_with` on key attributes. It works
fine as a filter on either Query (via `.where(...)`) or Scan (via
`.filter(...)`).
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
  .filter((attr, op) => op.or(op.eq(attr.status, 'published'), op.eq(attr.status, 'featured')))
  .execute();
```

### NOT

Negate a condition:

```typescript
const posts = await table.entities.Post.scan()
  .filter((attr, op) => op.not(op.eq(attr.published, false)))
  .execute();
```

### Complex Combinations

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'alice'),
      op.or(op.eq(attr.published, true), op.exists(attr.featured)),
      op.gt(attr.createdAt, '2024-01-01T00:00:00.000Z')
    )
  )
  .execute();
```

## Existence Checks

### Exists

Check if an attribute exists:

```typescript
const postsWithImages = await table.entities.Post.scan()
  .filter((attr, op) => op.exists(attr.imageUrl))
  .execute();
```

### Not Exists

Check if an attribute doesn't exist:

```typescript
const postsWithoutImages = await table.entities.Post.scan()
  .filter((attr, op) => op.notExists(attr.imageUrl))
  .execute();
```

## IN Operator

Check if value is in a list:

```typescript
const posts = await table.entities.Post.scan()
  .filter((attr, op) => op.in(attr.status, ['draft', 'review', 'published']))
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

When your model defines index key templates, you can query a GSI using your model's attribute names directly. Dynatable automatically maps the attribute to the correct GSI key and applies the key template:

```typescript
// Model definition:
// index: {
//   GSI1PK: { type: String, value: 'EMAIL#${email}' },
//   GSI1SK: { type: String, value: 'EMAIL#${email}' },
// }

// ✅ Use attribute names — Dynatable resolves them to GSI keys automatically
const user = await table.entities.User.query()
  .where((attr, op) => op.eq(attr.email, 'alice@example.com'))
  .useIndex('gsi1')
  .execute();
```

You can also use raw GSI key names with pre-formatted values if you prefer.
The string passed to `useIndex` must match the key in `schema.indexes`
exactly (case-sensitive):

```typescript
const publishedPosts = await table.entities.Post.query()
  .where((attr, op) =>
    op.and(op.eq(attr.GSI1PK, 'POST'), op.beginsWith(attr.GSI1SK, 'STATUS#published'))
  )
  .useIndex('gsi1')
  .execute();
```

### Composite (multi-variable) sort keys

A single GSI sort key template can reference more than one attribute, e.g. `RES#${category}#${code}`. Dynatable supports prefix queries on these composite keys via `beginsWith`:

```typescript
// Model definition:
// index: {
//   GSI1PK: { type: String, value: 'AIRPORT#${airport}' },
//   GSI1SK: { type: String, value: 'RES#${category}#${code}' },
// }

// ✅ beginsWith on `category` — Dynatable fills `${category}` and truncates the
// template at the next unfilled placeholder, so the prefix becomes "RES#GPU#".
const resources = await table.entities.AirportResource.query()
  .where((attr, op) =>
    op.and(op.eq(attr.airport, 'EZE'), op.beginsWith(attr.category, 'GPU'))
  )
  .useIndex('gsi1')
  .execute();
```

:::warning
Equality (`eq`) and other non-prefix operators on a composite-template attribute will throw, because the resulting key value would still contain unfilled `${...}` placeholders. Use `beginsWith` for prefix queries on composite keys, or supply all template variables.
:::

### Query with LSI

```typescript
const posts = await table.entities.Post.query()
  .where((attr, op) => op.and(op.eq(attr.username, 'alice'), op.gt(attr.views, 1000)))
  .useIndex('lsi1')
  .execute();
```

## Batch Get

Retrieve multiple items efficiently. `batchGet().execute()` returns a flat array of items:

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
- Result shape: `Model[]`
  :::

## Scan Operations

### Basic Scan

```typescript
const allUsers = await table.entities.User.scan().execute();
```

### Filtered Scan

```typescript
const activeUsers = await table.entities.User.scan()
  .filter((attr, op) => op.eq(attr.isActive, true))
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
      op.between(attr.createdAt, '2024-01-01T00:00:00.000Z', '2024-12-31T23:59:59.999Z')
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
  .filter((attr, op) => op.eq(attr.username, 'alice'))
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
// ✅ Query uses index with attribute name — key template applied automatically
const posts = await table.entities.Post.query()
  .where((attr, op) => op.eq(attr.status, 'published'))
  .useIndex('gsi1')
  .execute();

// ❌ Scan because no index
const posts = await table.entities.Post.scan()
  .filter((attr, op) => op.eq(attr.published, true))
  .execute();
```

## Next Steps

- **[Mutations](./mutations)** - Learn create, update, and delete operations
- **[Examples](../examples/blog-system)** - See real-world query examples
