---
sidebar_position: 3
---

# Schema Basics

Understanding schemas is fundamental to using Dynatable effectively. Your schema defines your data models, keys, attributes, and validation rules.

## Schema Structure

A Dynatable schema has four main parts:

```typescript
const schema = {
  format: 'dynatable:1.0.0', // Schema format version
  version: '1.0.0', // Your schema version
  indexes: {
    /* ... */
  }, // Index definitions
  models: {
    /* ... */
  }, // Entity models
  params: {
    /* ... */
  }, // Global parameters
} as const;
```

:::warning Important
Always add `as const` at the end of your schema for proper TypeScript type inference.
:::

## Indexes

Define your table's primary and secondary indexes:

```typescript
indexes: {
  primary: {
    hash: "pk",      // Partition key
    sort: "sk"       // Sort key (optional)
  },
  gsi1: {
    hash: "gsi1pk",
    sort: "gsi1sk"
  }
}
```

### Primary Index

Every table requires a primary index:

```typescript
indexes: {
  primary: {
    hash: "pk",      // Partition key name
    sort: "sk"       // Sort key name (optional)
  }
}
```

### Global Secondary Indexes (GSI)

Add GSIs for alternative access patterns:

```typescript
indexes: {
  primary: {
    hash: "pk",
    sort: "sk"
  },
  byEmail: {
    hash: "email",
    sort: "createdAt"
  },
  byStatus: {
    hash: "status",
    sort: "updatedAt"
  }
}
```

## Models

Models define your entities (User, Post, Order, etc.):

```typescript
models: {
  User: {
    key: { /* ... */ },
    attributes: { /* ... */ }
  },
  Post: {
    key: { /* ... */ },
    attributes: { /* ... */ }
  }
}
```

### Key Definition

Every model must define how its keys are constructed:

```typescript
User: {
  key: {
    pk: {
      type: String,
      value: "USER#${username}"  // Template using attributes
    },
    sk: {
      type: String,
      value: "USER#${username}"
    }
  },
  attributes: {
    username: { type: String, required: true }
  }
}
```

**Key Templates:**

- Use `${attributeName}` to reference attribute values
- Templates are evaluated when creating/querying items

**Single-Entity Keys:**

```typescript
key: {
  pk: { type: String, value: "USER#${userId}" },
  sk: { type: String, value: "USER#${userId}" }
}
```

**Hierarchical Keys:**

```typescript
key: {
  pk: { type: String, value: "USER#${username}" },
  sk: { type: String, value: "POST#${postId}" }
}
```

### Attributes

Define your entity's attributes with types and constraints:

```typescript
attributes: {
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  age: {
    type: Number
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: {
    type: Array
  }
}
```

## Attribute Types

Dynatable supports these primitive types:

### String

```typescript
username: {
  type: String,
  required: true
}
```

### Number

```typescript
age: {
  type: Number,
  default: 0
}
```

### Boolean

```typescript
isActive: {
  type: Boolean,
  default: true
}
```

### Date

```typescript
birthDate: {
  type: Date;
}
```

### Array

Use `type: Array` for a list of any values, or add `items` to get a fully typed array:

```typescript
// Untyped array
tags: {
  type: Array,
  default: [],
}

// Typed array of scalars
scores: {
  type: Array,
  items: { type: Number },
}

// Typed array of objects
frames: {
  type: Array,
  default: [],
  items: {
    type: Object,
    schema: {
      url: { type: String, required: true },
      duration: { type: Number },
    },
  },
}
```

### Object

Use `type: Object` for free-form maps, or add `schema` for a typed nested object:

```typescript
// Untyped object (any shape)
metadata: {
  type: Object,
}

// Typed nested object
location: {
  type: Object,
  schema: {
    city: { type: String },
    country: { type: String, required: true },
    lat: { type: Number },
    lng: { type: Number },
  },
}
```

Schemas can nest arbitrarily deep — an `Object` schema field can itself contain `Array` items, and vice versa.

## Attribute Options

### required

Mark attributes as required:

```typescript
username: {
  type: String,
  required: true  // Must be provided
}
```

### default

Provide default values:

```typescript
status: {
  type: String,
  default: "active"
}

createdAt: {
  type: Date,
  default: () => new Date()  // Function for dynamic defaults
}
```

### generate

Auto-generate values using ULID or UUID:

```typescript
userId: {
  type: String,
  generate: "ulid"  // or "uuid"
}
```

**ULID** (Universally Unique Lexicographically Sortable Identifier):

- Sortable by creation time
- URL-safe
- Case-insensitive
- Recommended for most use cases

**UUID** (Universally Unique Identifier):

- Random and unique
- Not sortable by time

## Global Parameters

Configure global behaviors:

```typescript
params: {
  timestamps: true,     // Add createdAt/updatedAt
  isoDates: true,       // Store dates as ISO strings
  typeField: "_type"    // Entity type field name
}
```

### timestamps

Automatically manage `createdAt` and `updatedAt`:

```typescript
params: {
  timestamps: true;
}

// When enabled, all entities get:
// - createdAt: set on creation
// - updatedAt: updated on every change
```

### isoDates

Store dates as ISO strings instead of timestamps:

```typescript
params: {
  isoDates: true; // Store as "2024-01-15T10:00:00.000Z"
}

// When false (default):
// Store as numbers: 1705315200000
```

### typeField

Customize the entity type field name:

```typescript
params: {
  typeField: '_type'; // Default
}

// In stored items:
// { _type: "User", username: "alice", ... }
```

## Complete Schema Example

Here's a comprehensive example:

```typescript
export const BlogSchema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',

  indexes: {
    primary: {
      hash: 'pk',
      sort: 'sk',
    },
    byEmail: {
      hash: 'email',
      sort: 'createdAt',
    },
  },

  models: {
    User: {
      key: {
        pk: { type: String, value: 'USER#${username}' },
        sk: { type: String, value: 'USER#${username}' },
      },
      attributes: {
        username: { type: String, required: true },
        email: { type: String, required: true },
        name: { type: String, required: true },
        bio: { type: String },
        age: { type: Number },
        isActive: { type: Boolean, default: true },
        role: { type: String, default: 'user' },
        tags: { type: Array },
      },
    },

    Post: {
      key: {
        pk: { type: String, value: 'USER#${username}' },
        sk: { type: String, value: 'POST#${postId}' },
      },
      attributes: {
        username: { type: String, required: true },
        postId: { type: String, generate: 'ulid' },
        title: { type: String, required: true },
        content: { type: String },
        published: { type: Boolean, default: false },
        views: { type: Number, default: 0 },
        tags: { type: Set, items: String },
      },
    },

    Comment: {
      key: {
        pk: { type: String, value: 'POST#${postId}' },
        sk: { type: String, value: 'COMMENT#${commentId}' },
      },
      attributes: {
        postId: { type: String, required: true },
        commentId: { type: String, generate: 'ulid' },
        username: { type: String, required: true },
        content: { type: String, required: true },
        likes: { type: Number, default: 0 },
      },
    },
  },

  params: {
    timestamps: true,
    isoDates: true,
  },
} as const;
```

## Type Inference

Dynatable automatically infers types from your schema:

```typescript
const user = await table.entities.User.get({
  username: 'alice',
}).execute();

// TypeScript knows:
user.username; // string
user.email; // string
user.age; // number | undefined
user.isActive; // boolean
user.createdAt; // Date
```

### Extracting Entity and Item Types

Use `InferModelFromSchema` and `InferInputFromSchema` to extract typed entity interfaces:

```typescript
import type { InferModelFromSchema, InferInputFromSchema, ArrayItem } from '@ftschopp/dynatable-core';

type UserEntity = InferModelFromSchema<typeof BlogSchema, 'User'>;
// createdAt / updatedAt are included automatically when params.timestamps = true

type UserInput = InferInputFromSchema<typeof BlogSchema, 'User'>;
// generated fields (ulid/uuid) and timestamps are excluded
```

For array attributes with a typed `items` schema, use `ArrayItem<T>` to extract the element type:

```typescript
type StoryEntity = InferModelFromSchema<typeof schema, 'Story'>;
type StoryFrame = ArrayItem<StoryEntity['frames']>;
// → { url: string; duration?: number }
```

## Schema Validation

Schemas are validated at runtime using Zod:

```typescript
// This will fail validation
await table.entities.User.put({
  username: 'alice',
  email: 'not-an-email', // Invalid email format
  age: '25', // Should be number, not string
}).execute();
```

## Next Steps

- **[Data Modeling](../guides/data-modeling)** - Learn how to design effective data models
- **[Single Table Design](../guides/single-table-design)** - Master single-table patterns
- **[Queries](../guides/queries)** - Start querying your data
