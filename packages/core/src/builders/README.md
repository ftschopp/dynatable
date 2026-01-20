# Builders Architecture

This directory contains the builder pattern implementation for DynamoDB operations.

## Structure

```
builders/
├── shared/           # Shared utilities and types
│   ├── types.ts      # Base types (Condition, OpBuilder, etc.)
│   ├── operators.ts  # Condition operators (eq, ne, lt, etc.)
│   └── conditions.ts # Condition expression builders
├── get/              # GET operation builder
│   ├── types.ts
│   ├── create-get-builder.ts
│   └── index.ts
├── put/              # PUT operation builder
│   ├── types.ts
│   ├── create-put-builder.ts
│   └── index.ts
└── query/            # QUERY operation builder
    ├── types.ts
    ├── create-query-builder.ts
    └── index.ts
```

## Design Principles

1. **Modularity**: Each operation has its own directory with dedicated types and implementation
2. **Reusability**: Common utilities are centralized in `shared/`
3. **Scalability**: Easy to add new operations (query, scan, delete, etc.) by following the same pattern
4. **Type Safety**: Full TypeScript support with proper type inference

## Adding a New Builder

To add a new operation (e.g., `query`):

1. Create a new directory: `builders/query/`
2. Add three files:
   - `types.ts` - Interface definition extending `OperationBuilder` or `ExecutableBuilder`
   - `create-query-builder.ts` - Implementation with immutable builder pattern
   - `index.ts` - Export all public APIs
3. Import shared utilities from `../shared`
4. Export from main `builders/index.ts`

## Usage Examples

### GET Operation

```typescript
import { createGetBuilder } from './builders';

const getBuilder = createGetBuilder(tableName, key, client)
  .select(['name', 'email'])
  .consistentRead();

const item = await getBuilder.execute();
```

### PUT Operation

```typescript
import { createPutBuilder } from './builders';

const putBuilder = createPutBuilder(tableName, item, client).ifNotExists().returning('ALL_NEW');

const result = await putBuilder.execute();
```

### QUERY Operation

```typescript
import { createQueryBuilder } from './builders';

// Basic query with partition key
const query1 = createQueryBuilder(tableName, client, model)
  .where((attr, op) => op.eq(attr.username, 'juanca'))
  .execute();

// Query with AND filter
const query2 = createQueryBuilder(tableName, client, model)
  .where((attr, op) => op.and(op.eq(attr.username, 'juanca'), op.gt(attr.likesCount, 10)))
  .limit(10)
  .scanIndexForward(false)
  .select(['id', 'title', 'createdAt'])
  .execute();

// Query with OR filter
const query3 = createQueryBuilder(tableName, client, model)
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'juanca'),
      op.or(op.gt(attr.likesCount, 100), op.gt(attr.commentCount, 50))
    )
  )
  .execute();

// Complex nested conditions
const query4 = createQueryBuilder(tableName, client, model)
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'juanca'),
      op.or(
        op.and(op.gt(attr.likesCount, 100), op.lt(attr.commentCount, 10)),
        op.gt(attr.likesCount, 500)
      )
    )
  )
  .execute();

// Query using a secondary index
const query5 = createQueryBuilder(tableName, client, model)
  .where((attr, op) => op.eq(attr.status, 'active'))
  .useIndex('GSI1')
  .execute();
```

## Type-Safe Queries

The Query Builder provides full TypeScript type safety with an intuitive API:

```typescript
// Your model type
type Photo = {
  username: string; // Used in partition key template
  photoId: string; // Used in sort key template
  url: string;
  likesCount: number;
  commentCount: number;
};

// Type-safe query - TypeScript knows all fields and their types!
const photos = await createQueryBuilder<Photo>(tableName, client, model)
  .where((attr, op) =>
    op.and(
      op.eq(attr.username, 'juanca'), // ✓ Key field - goes to KeyConditionExpression
      op.gt(attr.likesCount, 10) // ✓ Non-key field - goes to FilterExpression
    )
  )
  .select(['username', 'url', 'likesCount']) // ✓ Only Photo keys allowed
  .execute();

// TypeScript will catch errors at compile time:
// .where((attr, op) => op.eq(attr.invalid, 'x'))     // ✗ Property 'invalid' does not exist
// .where((attr, op) => op.eq(attr.username, 123))    // ✗ Argument of type 'number' not assignable
// .select(['invalidField'])                          // ✗ Type error!
```

### Important: Automatic Separation of Key Conditions vs Filters

The query builder **automatically separates** your conditions:

**KeyConditionExpression** (efficient, uses indexes):

- Fields used in partition key (pk) or sort key (sk) templates
- Evaluated during the query at the index level
- Very efficient - only reads matching items

**FilterExpression** (less efficient, post-processing):

- All other fields not in key templates
- Applied AFTER items are retrieved
- OR operators automatically go here (DynamoDB requirement)

```typescript
// ✓ The builder handles this automatically!
.where((attr, op) => op.and(
  op.eq(attr.username, 'juanca'),    // → KeyConditionExpression (username is in pk template)
  op.gt(attr.likesCount, 10)         // → FilterExpression (likesCount is not a key)
))

// Generates:
// KeyConditionExpression: "#username = :username_0"
// FilterExpression: "#likesCount > :likesCount_1"
```

## Important: Operator Isolation

Each builder creates its own isolated instance of operators with independent counters. This prevents naming conflicts when building multiple queries concurrently or reusing builder code.

```typescript
// ✓ Each builder has isolated state
const query1 = createQueryBuilder(table, client).where((attr, op) => op.eq(attr.id, '1')); // Uses :id_0

const query2 = createQueryBuilder(table, client).where((attr, op) => op.eq(attr.id, '2')); // Also uses :id_0 (isolated counter)

// No conflicts! Each builder has its own counter starting at 0
```

For advanced use cases where you need to manually create operators, use `createOpBuilder()`:

```typescript
import { createOpBuilder } from './builders/shared';

const op = createOpBuilder(); // Creates isolated operator instance
const condition = op.eq(attr, value);
```

## Available Operators

The `op` parameter in `.where()` provides these operators:

**Comparison Operators:**

- `op.eq(attr, value)` - Equals (=)
- `op.ne(attr, value)` - Not equals (<>)
- `op.lt(attr, value)` - Less than (<)
- `op.lte(attr, value)` - Less than or equal (<=)
- `op.gt(attr, value)` - Greater than (>)
- `op.gte(attr, value)` - Greater than or equal (>=)
- `op.between(attr, low, high)` - Between two values

**String Operators:**

- `op.beginsWith(attr, prefix)` - Begins with a string prefix (for string/binary fields)
- `op.contains(attr, value)` - Contains a substring or value (works with strings, sets, and lists)

**Existence Operators:**

- `op.exists(attr)` - Attribute exists
- `op.notExists(attr)` - Attribute does not exist

**Type Checking:**

- `op.attributeType(attr, type)` - Check the attribute's type
  - Valid types: `'S'` (String), `'N'` (Number), `'B'` (Binary), `'SS'` (String Set), `'NS'` (Number Set), `'BS'` (Binary Set), `'M'` (Map), `'L'` (List), `'NULL'`, `'BOOL'`

**Advanced Operators:**

- `op.in(attr, values[])` - Attribute value is in the provided array
- `op.size(attr)` - Get the size of an attribute (string length, number of elements in set/list, etc.)
  - Returns a `SizeRef` object with comparison methods:
    - `.eq(n)` - Size equals n
    - `.ne(n)` - Size not equals n
    - `.lt(n)` - Size less than n
    - `.lte(n)` - Size less than or equal to n
    - `.gt(n)` - Size greater than n
    - `.gte(n)` - Size greater than or equal to n

**Logical Operators:**

- `op.and(...conditions)` - Combines conditions with AND
- `op.or(...conditions)` - Combines conditions with OR
- `op.not(condition)` - Negates a condition

### Example Usage

```typescript
// Basic equality
.where((attr, op) => op.eq(attr.username, 'juanca'))

// Comparison operators
.where((attr, op) => op.and(
  op.eq(attr.username, 'juanca'),
  op.gt(attr.age, 18),
  op.lt(attr.score, 100)
))

// String operations
.where((attr, op) => op.beginsWith(attr.email, 'admin@'))

// Between operator
.where((attr, op) => op.between(attr.createdAt, '2024-01-01', '2024-12-31'))

// OR conditions
.where((attr, op) => op.or(
  op.eq(attr.status, 'active'),
  op.eq(attr.status, 'pending')
))

// Complex nested conditions
.where((attr, op) => op.and(
  op.eq(attr.org, 'acme'),
  op.or(
    op.and(
      op.gt(attr.score, 80),
      op.eq(attr.verified, true)
    ),
    op.eq(attr.role, 'admin')
  )
))

// NOT operator
.where((attr, op) => op.not(op.eq(attr.status, 'deleted')))

// Existence operators
.where((attr, op) => op.and(
  op.eq(attr.username, 'alice'),
  op.exists(attr.email)              // Has email field
))

.where((attr, op) => op.notExists(attr.deletedAt))  // Not deleted

// Contains operator (for strings, sets, lists)
.where((attr, op) => op.and(
  op.eq(attr.username, 'alice'),
  op.contains(attr.bio, 'developer')  // Bio contains "developer"
))

.where((attr, op) => op.contains(attr.tags, 'premium'))  // Has "premium" in tags set/list

// IN operator
.where((attr, op) => op.in(attr.status, ['active', 'pending', 'verified']))

// Size operator
.where((attr, op) => op.size(attr.tags).gte(3))        // At least 3 tags
.where((attr, op) => op.size(attr.username).lt(20))    // Username shorter than 20 chars
.where((attr, op) => op.size(attr.comments).eq(0))     // No comments

// Attribute type checking
.where((attr, op) => op.attributeType(attr.metadata, 'M'))  // Is a Map
.where((attr, op) => op.attributeType(attr.items, 'L'))     // Is a List

// Complex example with new operators
await table.entities.User.query()
  .where((attr, op) => op.and(
    op.eq(attr.status, 'active'),
    op.exists(attr.email),
    op.size(attr.followers).gte(10),
    op.or(
      op.contains(attr.tags, 'premium'),
      op.contains(attr.tags, 'verified')
    )
  ))
  .execute();

// Complete example with all features
await table.entities.Photo.query()
  .where((attr, op) => op.and(
    op.eq(attr.username, 'juanca'),              // Key field
    op.or(
      op.gt(attr.likesCount, 100),               // Filter field
      op.gt(attr.commentCount, 50)               // Filter field
    )
  ))
  .limit(50)
  .scanIndexForward(false)
  .execute();
```
