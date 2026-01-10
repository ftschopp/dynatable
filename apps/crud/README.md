# CRUD App - Dynatable Testing

Testing app for Dynatable using DynamoDB Local. Includes complete CRUD examples for an Instagram clone.

## Requirements

- Node.js 18+
- Docker and Docker Compose
- Yarn

## Quick Start

### 1. Start DynamoDB Local

```bash
cd apps/crud
yarn docker:up
```

This will start:

- **DynamoDB Local** at `http://localhost:8000`
- **DynamoDB Admin UI** at `http://localhost:8001` (web interface to view data)

### 2. Create the Table

```bash
yarn setup:table
```

This script:

- Deletes the `InstagramClone` table if it exists
- Creates a new table with the necessary indexes
- Configures GSI1 for advanced queries

### 3. Run the CRUD Examples

```bash
yarn dev
```

This will run 18 different examples that demonstrate:

## Included Examples

### Basic Operations

1. **CREATE** - Create users
2. **READ** - Get user by username
3. **CREATE** - Create photos
4. **QUERY** - List user's photos
5. **CREATE** - Create likes
6. **QUERY** - List photo likes
7. **UPDATE** - Update like counter
8. **CREATE** - Create comments
9. **QUERY** - List photo comments
10. **CREATE** - Create follows
11. **QUERY** - List followers
12. **SCAN** - List all users

### Advanced Operations

13. **UPDATE with ADD** - Atomically increment counter
14. **PAGINATION** - Pagination with limit
15. **CONDITIONAL PUT** - Prevent overwrite
16. **DELETE** - Delete items
17. **TRANSACTION** - Atomic operations (TransactWrite)
18. **QUERY with FILTERS** - Searches with complex filters

## Available Commands

```bash
# Docker
yarn docker:up          # Start DynamoDB Local
yarn docker:down        # Stop DynamoDB Local
yarn docker:logs        # View DynamoDB Local logs

# DynamoDB
yarn setup:table        # Create/recreate the table

# Development
yarn dev                # Run examples with DynamoDB Local
yarn dev:aws            # Run with real AWS (requires AWS_PROFILE)
yarn build              # Compile TypeScript
yarn clean              # Clean node_modules and builds
```

## Schema Structure

The schema implements a **Single Table Design** for an Instagram clone:

### Entities

- **User**: System users
- **Photo**: Photos published by users
- **Like**: Likes on photos
- **Comment**: Comments on photos
- **Follow**: Follow relationships between users

### Access Patterns

| Pattern                    | Entity  | Key                      | Index   |
| -------------------------- | ------- | ------------------------ | ------- |
| Get user                   | User    | PK=USER#{username}       | Primary |
| List user photos           | Photo   | PK=UP#{username}         | Primary |
| List photo likes           | Like    | PK=PL#{photoId}          | Primary |
| List likes chronologically | Like    | GSI1PK=PL#{photoId}      | GSI1    |
| List photo comments        | Comment | PK=PC#{photoId}          | Primary |
| List followers             | Follow  | PK=FOLLOW#{username}     | Primary |
| List following             | Follow  | GSI1PK=FOLLOW#{username} | GSI1    |

## DynamoDB Admin UI

Open `http://localhost:8001` in your browser to view:

- All tables
- Items in each table
- Execute queries/scans manually
- Inspect indexes

## Troubleshooting

### Error: "Cannot connect to DynamoDB Local"

Make sure Docker is running:

```bash
yarn docker:up
docker ps  # Should show dynamodb-local running
```

### Error: "Table already exists"

Run the setup script again, which deletes and recreates the table:

```bash
yarn setup:table
```

### Error: "ResourceNotFoundException"

The table doesn't exist. Run:

```bash
yarn setup:table
```

### Clean all data

To start from scratch:

```bash
yarn docker:down
rm -rf dynamodb-data
yarn docker:up
yarn setup:table
```

## Next Steps

- Modify `src/index.ts` to test your own queries
- Experiment with different conditions and filters
- Try more complex batch operations
- Implement new access patterns

## References

- [DynamoDB Local Docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)
- [DynamoDB Admin](https://github.com/aaronshaf/dynamodb-admin)
- [Dynatable Core](../../packages/core)
