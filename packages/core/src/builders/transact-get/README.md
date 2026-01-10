# TransactGet - Atomic Multi-Item Reads

TransactGet provides atomic multi-item read operations in DynamoDB. Get multiple items with snapshot isolation.

## Features

- **Functional API**: Immutable builders using pure functions
- **Type-safe**: Full TypeScript support
- **Atomic**: Snapshot isolation across items
- **Composable**: Chain operations fluently

## Usage

### Basic Example

```typescript
import { createTransactGetBuilder } from '@repo/core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const [item1, item2] = await createTransactGetBuilder(client)
  .addGet(getParams1)
  .addGet(getParams2)
  .execute();
```

### With Table API

```typescript
const table = new Table({
  name: 'MyTable',
  client: new DynamoDBClient({}),
  schema: MySchema,
});

// Get user and photo atomically
const [user, photo] = await table
  .transactGet()
  .addGet(table.entities.User.get({ username: 'alice' }).dbParams())
  .addGet(
    table.entities.Photo.get({
      username: 'alice',
      photoId: '123',
    }).dbParams()
  )
  .execute();
```

## Real-World Examples

### Get User + Photo + Comment

```typescript
const [user, photo, comment] = await table
  .transactGet()
  .addGet(table.entities.User.get({ username: 'alice' }).dbParams())
  .addGet(
    table.entities.Photo.get({
      username: 'alice',
      photoId: '123',
    }).dbParams()
  )
  .addGet(
    table.entities.Comment.get({
      photoId: '123',
      commentId: '456',
    }).dbParams()
  )
  .execute();
```

### Verify Follow Relationship

```typescript
// Get follow relationship and both users atomically
const [follow, follower, followed] = await table
  .transactGet()
  .addGet(
    table.entities.Follow.get({
      followedUsername: 'alice',
      followingUsername: 'bob',
    }).dbParams()
  )
  .addGet(table.entities.User.get({ username: 'bob' }).dbParams())
  .addGet(table.entities.User.get({ username: 'alice' }).dbParams())
  .execute();

// Verify counters match
console.log(follower.followingCount); // Includes alice
console.log(followed.followerCount); // Includes bob
```

### Get Photo with Engagement

```typescript
const [photo, like, comment] = await table
  .transactGet()
  .addGet(
    table.entities.Photo.get({
      username: 'alice',
      photoId: '123',
    }).dbParams()
  )
  .addGet(
    table.entities.Like.get({
      photoId: '123',
      likingUsername: 'bob',
    }).dbParams()
  )
  .addGet(
    table.entities.Comment.get({
      photoId: '123',
      commentId: '456',
    }).dbParams()
  )
  .execute();
```

## With Projections

```typescript
const [user] = await table
  .transactGet()
  .addGet({
    TableName: 'MyTable',
    Key: { pk: 'USER#alice', sk: 'USER#alice' },
    ProjectionExpression: 'username, name, followerCount',
    ExpressionAttributeNames: {
      '#username': 'username',
      '#name': 'name',
      '#followerCount': 'followerCount',
    },
  })
  .execute();
```

## Functional Design

The builder is immutable - each method returns a new instance:

```typescript
const builder1 = table.transactGet();
const builder2 = builder1.addGet(params1);
const builder3 = builder2.addGet(params2);

builder1.dbParams().TransactItems.length; // 0
builder2.dbParams().TransactItems.length; // 1
builder3.dbParams().TransactItems.length; // 2
```

## Return Value

`execute()` returns an array of items in the same order as the `addGet()` calls:

```typescript
const [user, photo, comment] = await builder.execute();
```

If an item doesn't exist, the corresponding array element will be `undefined`.

## Limitations

- Maximum **25 items** per transaction
- Maximum **4 MB** total size
- Single table only
- Provides snapshot isolation (consistent reads across items)
