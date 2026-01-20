# TransactWrite - Atomic Multi-Item Writes

TransactWrite provides atomic multi-item write operations in DynamoDB. All operations in a transaction either succeed together or fail together.

## Features

- **Functional API**: Immutable builders using pure functions
- **Type-safe**: Full TypeScript support with AWS SDK types
- **Composable**: Chain operations fluently
- **Idempotent**: Support for client request tokens
- **Flexible**: Accepts both entity builder outputs and raw DynamoDB parameters

## Usage

### Basic Example

```typescript
import { createTransactWriteBuilder } from '@repo/core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

await createTransactWriteBuilder(client).addPut(putParams).addUpdate(updateParams).execute();
```

### With Table API

```typescript
const table = new Table({
  name: 'MyTable',
  client: new DynamoDBClient({}),
  schema: MySchema,
});

// Like a photo atomically
await table
  .transactWrite()
  .addPut(
    table.entities.Like.put({
      photoId: '123',
      likingUsername: 'alice',
    })
      .ifNotExists()
      .dbParams()
  )
  .addUpdate(
    table.entities.Photo.update({
      username: 'bob',
      photoId: '123',
    })
      .add('likesCount', 1)
      .dbParams()
  )
  .execute();
```

## Real-World Examples

### Follow a User

```typescript
await table
  .transactWrite()
  .addPut(
    table.entities.Follow.put({
      followedUsername: 'alice',
      followingUsername: 'bob',
    })
      .ifNotExists()
      .dbParams()
  )
  .addUpdate(table.entities.User.update({ username: 'alice' }).add('followerCount', 1).dbParams())
  .addUpdate(table.entities.User.update({ username: 'bob' }).add('followingCount', 1).dbParams())
  .execute();
```

### Comment on Photo

```typescript
await table
  .transactWrite()
  .addPut(
    table.entities.Comment.put({
      photoId: '123',
      commentingUsername: 'charlie',
      content: 'Great photo!',
    }).dbParams()
  )
  .addUpdate(
    table.entities.Photo.update({
      username: 'alice',
      photoId: '123',
    })
      .add('commentCount', 1)
      .dbParams()
  )
  .execute();
```

### Delete with Safety Check

```typescript
// Only delete if photo has no engagement
await table
  .transactWrite()
  .addDelete(
    table.entities.Photo.delete({
      username: 'alice',
      photoId: '123',
    })
      .where((attr, op) => op.and(op.eq(attr.likesCount, 0), op.eq(attr.commentCount, 0)))
      .dbParams()
  )
  .execute();
```

### Condition Check

```typescript
// Create user only if admin exists
await table
  .transactWrite()
  .addPut(
    table.entities.User.put({
      username: 'newuser',
      name: 'New User',
    })
      .ifNotExists()
      .dbParams()
  )
  .addConditionCheck({
    TableName: 'MyTable',
    Key: { pk: 'USER#admin', sk: 'USER#admin' },
    ConditionExpression: 'attribute_exists(#pk)',
    ExpressionAttributeNames: { '#pk': 'pk' },
  })
  .execute();
```

## Idempotency

Use client request tokens for idempotent operations:

```typescript
await table.transactWrite().addPut(params).withClientRequestToken('unique-id-12345').execute();
```

## Type Safety

All operations are fully typed using AWS SDK types:

```typescript
import type {
  TransactPutParams,
  TransactUpdateParams,
  TransactDeleteParams,
  TransactConditionCheckParams,
} from '@ftschopp/dynatable-core';

// addPut accepts PutCommandInput from @aws-sdk/lib-dynamodb
const putParams: TransactPutParams = {
  TableName: 'MyTable',
  Item: { pk: 'USER#123', sk: 'USER#123', name: 'John' },
};

// TypeScript validates all parameters at compile time
table.transactWrite().addPut(putParams).execute();
```

### Using Entity Builders

Entity builders automatically provide correctly typed parameters via `.dbParams()`:

```typescript
// The entity builder's dbParams() returns PutCommandInput
const params = table.entities.User.put({ username: 'john' }).ifNotExists().dbParams();
// params is typed as PutCommandInput

// Pass it to the transaction builder
table.transactWrite().addPut(params).execute();
```

## Functional Design

The builder is immutable - each method returns a new instance:

```typescript
const builder1 = table.transactWrite();
const builder2 = builder1.addPut(params1);
const builder3 = builder2.addPut(params2);

builder1.dbParams().TransactItems.length; // 0
builder2.dbParams().TransactItems.length; // 1
builder3.dbParams().TransactItems.length; // 2
```

## Limitations

- Maximum **100 items** per transaction
- Maximum **4 MB** total size
- Single table only
- May fail with `TransactionCanceledException` if conditions fail
