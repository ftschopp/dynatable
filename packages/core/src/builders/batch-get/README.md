# BatchGet Builder

The `BatchGetBuilder` retrieves multiple items by key in a single DynamoDB `BatchGetItem` request. It is consumed via the entity API (`table.entities.<Entity>.batchGet([...])`), and `execute()` returns a flat `Model[]`.

## Features

- Retrieve multiple items by their keys
- Supports attribute projection (select only specific fields)
- Supports consistent read

## Basic Usage

```typescript
const users = await table.entities.User.batchGet([
  { username: 'alice' },
  { username: 'bob' },
  { username: 'charlie' },
]).execute();

users.forEach((user) => console.log(user.username));
```

## With Attribute Projection

```typescript
const users = await table.entities.User.batchGet([
  { username: 'alice' },
  { username: 'bob' },
])
  .select(['username', 'name', 'followerCount'])
  .execute();
```

## With Consistent Read

```typescript
const users = await table.entities.User.batchGet([
  { username: 'alice' },
  { username: 'bob' },
])
  .consistentRead()
  .execute();
```

## DynamoDB Limitations

- Maximum 100 items per request
- Maximum 16 MB of data per request
- Unprocessed items are returned in `UnprocessedKeys` and must be retried
