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
    hash: "PK",        // Partition key column name
    sort: "SK"         // Sort key column name (optional)
  },
  gsi1: {
    hash: "GSI1PK",
    sort: "GSI1SK"
  }
}
```

The `hash` and `sort` strings are the actual DynamoDB attribute names used for the index. They must match the keys you declare on each model under `key:` (and `index:` for GSIs).

### Primary Index

Every table requires a primary index. The keys are uppercase by convention and **must** be named `PK` and `SK` on each model:

```typescript
indexes: {
  primary: {
    hash: "PK",
    sort: "SK"
  }
}
```

### Global Secondary Indexes (GSI)

Add GSIs for alternative access patterns:

```typescript
indexes: {
  primary: {
    hash: "PK",
    sort: "SK"
  },
  gsi1: {
    hash: "GSI1PK",
    sort: "GSI1SK"
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

Every model must define `PK` and `SK` (uppercase) under `key:`:

```typescript
User: {
  key: {
    PK: {
      type: String,
      value: "USER#${username}"  // Template using attributes
    },
    SK: {
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
  PK: { type: String, value: "USER#${userId}" },
  SK: { type: String, value: "USER#${userId}" }
}
```

**Hierarchical Keys:**

```typescript
key: {
  PK: { type: String, value: "USER#${username}" },
  SK: { type: String, value: "POST#${postId}" }
}
```

### Index Keys (GSI)

GSI key templates go on the model's `index:` field, not inside `attributes:`. The keys here must match the GSI column names declared in `indexes`:

```typescript
Post: {
  key: {
    PK: { type: String, value: "USER#${username}" },
    SK: { type: String, value: "POST#${postId}" },
  },
  index: {
    GSI1PK: { type: String, value: "POST" },
    GSI1SK: { type: String, value: "STATUS#${published}#${postId}" },
  },
  attributes: {
    username: { type: String, required: true },
    postId: { type: String, generate: "ulid" },
    title: { type: String, required: true },
    published: { type: Boolean, default: false },
  },
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
  timestamps: true,         // Add createdAt / updatedAt
  cleanInternalKeys: true,  // Strip PK/SK/_type from returned items
}
```

### timestamps

Automatically manage `createdAt` and `updatedAt`. When enabled, both fields are stored as ISO 8601 strings:

```typescript
params: {
  timestamps: true;
}

// When enabled, all entities get:
// - createdAt: set on creation, ISO string (e.g. "2024-01-15T10:00:00.000Z")
// - updatedAt: updated on every change, ISO string
```

### cleanInternalKeys

When set to `true`, Dynatable strips internal keys (`PK`, `SK`, `_type`) from items returned by reads. Use this if you want a clean shape that matches your business attributes only.

## Complete Schema Example

Here's a comprehensive example:

```typescript
export const BlogSchema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',

  indexes: {
    primary: {
      hash: 'PK',
      sort: 'SK',
    },
    gsi1: {
      hash: 'GSI1PK',
      sort: 'GSI1SK',
    },
  },

  models: {
    User: {
      key: {
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'USER#${username}' },
      },
      index: {
        GSI1PK: { type: String, value: 'EMAIL#${email}' },
        GSI1SK: { type: String, value: 'EMAIL#${email}' },
      },
      attributes: {
        username: { type: String, required: true },
        email: { type: String, required: true },
        name: { type: String, required: true },
        bio: { type: String },
        age: { type: Number },
        isActive: { type: Boolean, default: true },
        role: { type: String, default: 'user' },
        tags: { type: Array, items: { type: String } },
      },
    },

    Post: {
      key: {
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'POST#${postId}' },
      },
      attributes: {
        username: { type: String, required: true },
        postId: { type: String, generate: 'ulid' },
        title: { type: String, required: true },
        content: { type: String },
        published: { type: Boolean, default: false },
        views: { type: Number, default: 0 },
        tags: { type: Array, items: { type: String } },
      },
    },

    Comment: {
      key: {
        PK: { type: String, value: 'POST#${postId}' },
        SK: { type: String, value: 'COMMENT#${commentId}' },
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
user.createdAt; // string (ISO 8601, when params.timestamps is true)
```

### Extracting Entity and Item Types

Use `InferModelFromSchema` and `InferInputFromSchema` to extract typed entity interfaces:

```typescript
import type {
  InferModelFromSchema,
  InferInputFromSchema,
  ArrayItem,
} from '@ftschopp/dynatable-core';

type UserEntity = InferModelFromSchema<typeof BlogSchema, 'User'>;
// createdAt / updatedAt are included automatically when params.timestamps = true
// Both are typed as string (ISO 8601)

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

Schemas are validated at runtime using Zod. Validation enforces the declared types (string, number, boolean, etc.) and required fields:

```typescript
// This will fail validation
await table.entities.User.put({
  username: 'alice',
  age: '25', // Error: Expected number, got string
}).execute();
```

For richer validation (email format, length constraints, regex, etc.), validate the input with your own Zod schemas before calling `.put()` / `.update()`.

## Next Steps

- **[Data Modeling](../guides/data-modeling)** - Learn how to design effective data models
- **[Single Table Design](../guides/single-table-design)** - Master single-table patterns
- **[Queries](../guides/queries)** - Start querying your data
