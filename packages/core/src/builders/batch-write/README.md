# BatchWrite Builder

The `BatchWriteBuilder` allows writing (put) or deleting (delete) multiple items from one or more tables in a single request to DynamoDB.

## Features

- Create multiple items (PutRequest)
- Delete multiple items (DeleteRequest)
- Mix Put and Delete operations in a single request
- Supports multiple tables in a single request
- Handles unprocessed items (UnprocessedItems)

## Basic Usage - Create Items

```typescript
import { createBatchWriteBuilder } from './builders/batch-write';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

// Create multiple users
const result = await createBatchWriteBuilder(
  {
    Users: [
      {
        PutRequest: {
          Item: {
            pk: 'USER#alice',
            sk: 'USER#alice',
            username: 'alice',
            name: 'Alice Smith',
            followerCount: 0,
            followingCount: 0,
          },
        },
      },
      {
        PutRequest: {
          Item: {
            pk: 'USER#bob',
            sk: 'USER#bob',
            username: 'bob',
            name: 'Bob Jones',
            followerCount: 0,
            followingCount: 0,
          },
        },
      },
    ],
  },
  client
).execute();
```

## Delete Items

```typescript
const result = await createBatchWriteBuilder(
  {
    Users: [
      {
        DeleteRequest: {
          Key: {
            pk: 'USER#alice',
            sk: 'USER#alice',
          },
        },
      },
      {
        DeleteRequest: {
          Key: {
            pk: 'USER#bob',
            sk: 'USER#bob',
          },
        },
      },
    ],
  },
  client
).execute();
```

## Mix Put and Delete

```typescript
const result = await createBatchWriteBuilder(
  {
    Users: [
      {
        PutRequest: {
          Item: {
            pk: 'USER#alice',
            sk: 'USER#alice',
            username: 'alice',
            name: 'Alice Smith Updated',
          },
        },
      },
      {
        DeleteRequest: {
          Key: {
            pk: 'USER#bob',
            sk: 'USER#bob',
          },
        },
      },
    ],
  },
  client
).execute();
```

## Using the Table Class

```typescript
// Create multiple items using the Table class
const result = await table
  .batchWrite({
    InstagramClone: [
      {
        PutRequest: {
          Item: {
            pk: 'USER#alice',
            sk: 'USER#alice',
            username: 'alice',
            name: 'Alice Smith',
          },
        },
      },
      {
        DeleteRequest: {
          Key: {
            pk: 'USER#bob',
            sk: 'USER#bob',
          },
        },
      },
    ],
  })
  .execute();

// Handle unprocessed items
if (result.unprocessedItems) {
  console.log('Unprocessed items:', result.unprocessedItems);
  // Retry unprocessed items
}
```

## Bulk Operations

```typescript
// Create multiple photos and likes in a single request
await table
  .batchWrite({
    InstagramClone: [
      {
        PutRequest: {
          Item: {
            pk: 'UP#alice',
            sk: 'PHOTO#photo1',
            username: 'alice',
            photoId: 'photo1',
            url: 'https://example.com/photo1.jpg',
            likesCount: 0,
            commentCount: 0,
          },
        },
      },
      {
        PutRequest: {
          Item: {
            pk: 'UP#alice',
            sk: 'PHOTO#photo2',
            username: 'alice',
            photoId: 'photo2',
            url: 'https://example.com/photo2.jpg',
            likesCount: 0,
            commentCount: 0,
          },
        },
      },
      {
        PutRequest: {
          Item: {
            pk: 'PL#photo1',
            sk: 'LIKE#bob',
            photoId: 'photo1',
            likingUsername: 'bob',
            likeId: 'like123',
          },
        },
      },
    ],
  })
  .execute();
```

## DynamoDB Limitations

- Maximum 25 items per request
- Maximum 16 MB of data per request
- Does not support conditions (ConditionExpression)
- Unprocessed items are returned in `UnprocessedItems` and must be retried
- Put operations completely overwrite the existing item
