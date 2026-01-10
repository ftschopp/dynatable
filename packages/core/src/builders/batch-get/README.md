# BatchGet Builder

The `BatchGetBuilder` allows retrieving multiple items from one or more tables in a single request to DynamoDB.

## Features

- Retrieve multiple items by their keys
- Supports attribute projection (select only specific fields)
- Supports consistent read
- Can retrieve items from multiple tables in a single request

## Basic Usage

```typescript
import { createBatchGetBuilder } from './builders/batch-get';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

// Retrieve multiple users
const result = await createBatchGetBuilder(
  {
    Users: {
      Keys: [
        { pk: 'USER#alice', sk: 'USER#alice' },
        { pk: 'USER#bob', sk: 'USER#bob' },
        { pk: 'USER#charlie', sk: 'USER#charlie' },
      ],
    },
  },
  client
).execute();
```

## With Attribute Projection

```typescript
interface User {
  username: string;
  name: string;
  followerCount: number;
}

const result = await createBatchGetBuilder<User>(
  {
    Users: {
      Keys: [
        { pk: 'USER#alice', sk: 'USER#alice' },
        { pk: 'USER#bob', sk: 'USER#bob' },
      ],
    },
  },
  client
)
  .select(['username', 'name', 'followerCount'])
  .execute();
```

## With Consistent Read

```typescript
const result = await createBatchGetBuilder(
  {
    Users: {
      Keys: [
        { pk: 'USER#alice', sk: 'USER#alice' },
        { pk: 'USER#bob', sk: 'USER#bob' },
      ],
    },
  },
  client
)
  .consistentRead()
  .execute();
```

## Using the Table Class

```typescript
// Retrieve multiple users using the Table class
const result = await table
  .batchGet({
    InstagramClone: {
      Keys: [
        { pk: 'USER#alice', sk: 'USER#alice' },
        { pk: 'USER#bob', sk: 'USER#bob' },
      ],
    },
  })
  .select(['username', 'name'])
  .execute();
```

## DynamoDB Limitations

- Maximum 100 items per request
- Maximum 16 MB of data per request
- Unprocessed items are returned in `UnprocessedKeys` and must be retried
