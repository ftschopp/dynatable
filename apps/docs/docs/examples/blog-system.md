---
sidebar_position: 1
---

# Blog System

A complete example of building a blog system with users, posts, comments, and tags using Dynatable.

## Schema Design

GSI key templates live on each model's `index:` field, not inside `attributes:`.

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
      attributes: {
        username: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        bio: { type: String },
        avatar: { type: String },
        followerCount: { type: Number, default: 0 },
        followingCount: { type: Number, default: 0 },
      },
    },

    Post: {
      key: {
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'POST#${postId}' },
      },
      index: {
        // GSI for querying all posts by status
        GSI1PK: { type: String, value: 'POST' },
        GSI1SK: { type: String, value: 'STATUS#${published}#${postId}' },
      },
      attributes: {
        username: { type: String, required: true },
        postId: { type: String, generate: 'ulid' },
        title: { type: String, required: true },
        content: { type: String, required: true },
        published: { type: Boolean, default: false },
        views: { type: Number, default: 0 },
        likes: { type: Number, default: 0 },
      },
    },

    Comment: {
      key: {
        PK: { type: String, value: 'POST#${postId}' },
        SK: { type: String, value: 'COMMENT#${commentId}' },
      },
      index: {
        // GSI for querying comments by user
        GSI1PK: { type: String, value: 'USER#${username}' },
        GSI1SK: { type: String, value: 'COMMENT#${commentId}' },
      },
      attributes: {
        postId: { type: String, required: true },
        commentId: { type: String, generate: 'ulid' },
        username: { type: String, required: true },
        content: { type: String, required: true },
        likes: { type: Number, default: 0 },
      },
    },

    Tag: {
      key: {
        PK: { type: String, value: 'POST#${postId}' },
        SK: { type: String, value: 'TAG#${tag}' },
      },
      index: {
        // GSI for reverse lookup (tag → posts)
        GSI1PK: { type: String, value: 'TAG#${tag}' },
        GSI1SK: { type: String, value: 'POST#${postId}' },
      },
      attributes: {
        postId: { type: String, required: true },
        tag: { type: String, required: true },
      },
    },
  },

  params: {
    timestamps: true,
  },
} as const;
```

## Table Setup

```typescript
import { Table } from '@ftschopp/dynatable-core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BlogSchema } from './schema';

export const table = new Table({
  name: 'BlogTable',
  client: new DynamoDBClient({ region: 'us-east-1' }),
  schema: BlogSchema,
});
```

## User Operations

### Create User

```typescript
async function createUser(username: string, name: string, email: string) {
  return await table.entities.User.put({
    username,
    name,
    email,
    bio: '',
    followerCount: 0,
    followingCount: 0,
  })
    .ifNotExists()
    .execute();
}

// Usage
await createUser('alice', 'Alice Smith', 'alice@example.com');
```

### Get User Profile

```typescript
async function getUserProfile(username: string) {
  return await table.entities.User.get({
    username,
  }).execute();
}

// Usage
const user = await getUserProfile('alice');
console.log(user.name, user.bio);
```

### Update User Profile

```typescript
async function updateUserProfile(
  username: string,
  updates: { name?: string; bio?: string; avatar?: string }
) {
  let query = table.entities.User.update({ username });

  if (updates.name) query = query.set('name', updates.name);
  if (updates.bio) query = query.set('bio', updates.bio);
  if (updates.avatar) query = query.set('avatar', updates.avatar);

  return await query.returning('ALL_NEW').execute();
}

// Usage
await updateUserProfile('alice', {
  bio: 'Senior software engineer and tech blogger',
  avatar: 'https://example.com/avatar.jpg',
});
```

## Post Operations

### Create Post

```typescript
async function createPost(
  username: string,
  title: string,
  content: string,
  published: boolean = false
) {
  return await table.entities.Post.put({
    username,
    title,
    content,
    published,
  }).execute();
}

// Usage
const post = await createPost(
  'alice',
  'Getting Started with DynamoDB',
  'DynamoDB is a powerful NoSQL database...',
  true
);

console.log(post.postId); // Auto-generated ULID
```

### Get Post

```typescript
async function getPost(username: string, postId: string) {
  return await table.entities.Post.get({
    username,
    postId,
  }).execute();
}
```

### Get All Posts by User

```typescript
async function getUserPosts(username: string, limit: number = 20) {
  return await table.entities.Post.query()
    .where((attr, op) => op.eq(attr.username, username))
    .limit(limit)
    .scanIndexForward(false) // Newest first
    .execute();
}

// Usage
const posts = await getUserPosts('alice', 10);
posts.forEach((post) => {
  console.log(post.title, post.createdAt);
});
```

### Get All Published Posts

```typescript
async function getPublishedPosts(limit: number = 50) {
  return await table.entities.Post.query()
    .where((attr, op) =>
      op.and(op.eq(attr.GSI1PK, 'POST'), op.beginsWith(attr.GSI1SK, 'STATUS#true'))
    )
    .useIndex('gsi1')
    .limit(limit)
    .scanIndexForward(false)
    .execute();
}

// Usage
const publishedPosts = await getPublishedPosts(20);
```

### Update Post

```typescript
async function updatePost(
  username: string,
  postId: string,
  updates: { title?: string; content?: string; published?: boolean }
) {
  let query = table.entities.Post.update({ username, postId });

  if (updates.title) query = query.set('title', updates.title);
  if (updates.content) query = query.set('content', updates.content);
  if (updates.published !== undefined) {
    query = query.set('published', updates.published);
  }

  return await query.returning('ALL_NEW').execute();
}
```

### Increment Post Views

```typescript
async function incrementPostViews(username: string, postId: string) {
  return await table.entities.Post.update({
    username,
    postId,
  })
    .add('views', 1)
    .execute();
}
```

### Like Post

```typescript
async function likePost(username: string, postId: string) {
  return await table.entities.Post.update({
    username,
    postId,
  })
    .add('likes', 1)
    .execute();
}
```

### Delete Post

```typescript
async function deletePost(username: string, postId: string) {
  return await table.entities.Post.delete({
    username,
    postId,
  }).execute();

  // Note: comments and tags live under different partition keys.
  // To clean them up, query each related model and delete the items
  // in a transaction or batch as appropriate.
}
```

## Comment Operations

### Add Comment

```typescript
async function addComment(postId: string, username: string, content: string) {
  return await table.entities.Comment.put({
    postId,
    username,
    content,
  }).execute();
}

// Usage
const comment = await addComment('post123', 'bob', 'Great article! Very informative.');
```

### Get Post Comments

```typescript
async function getPostComments(postId: string) {
  return await table.entities.Comment.query()
    .where((attr, op) => op.eq(attr.postId, postId))
    .scanIndexForward(true) // Oldest first
    .execute();
}

// Usage
const comments = await getPostComments('post123');
comments.forEach((comment) => {
  console.log(`${comment.username}: ${comment.content}`);
});
```

### Get User Comments

```typescript
async function getUserComments(username: string, limit: number = 50) {
  return await table.entities.Comment.query()
    .where((attr, op) => op.eq(attr.username, username))
    .useIndex('gsi1')
    .limit(limit)
    .scanIndexForward(false)
    .execute();
}
```

### Like Comment

```typescript
async function likeComment(postId: string, commentId: string) {
  return await table.entities.Comment.update({
    postId,
    commentId,
  })
    .add('likes', 1)
    .execute();
}
```

## Tag Operations

### Add Tags to Post

```typescript
async function addTagsToPost(postId: string, tags: string[]) {
  const tagItems = tags.map((tag) => ({
    postId,
    tag: tag.toLowerCase(),
  }));

  await table.entities.Tag.batchWrite(tagItems).execute();
}

// Usage
await addTagsToPost('post123', ['typescript', 'dynamodb', 'tutorial']);
```

### Get Post Tags

```typescript
async function getPostTags(postId: string) {
  const tags = await table.entities.Tag.query()
    .where((attr, op) => op.eq(attr.postId, postId))
    .execute();

  return tags.map((t) => t.tag);
}

// Usage
const tags = await getPostTags('post123');
console.log(tags); // ['typescript', 'dynamodb', 'tutorial']
```

### Get Posts by Tag

```typescript
async function getPostsByTag(tag: string, limit: number = 20) {
  return await table.entities.Tag.query()
    .where((attr, op) => op.eq(attr.tag, tag.toLowerCase()))
    .useIndex('gsi1')
    .limit(limit)
    .execute();
}

// Usage
const typescriptPosts = await getPostsByTag('typescript', 10);
```

## Complete Workflows

### Publish Post with Tags

```typescript
async function publishPostWithTags(
  username: string,
  title: string,
  content: string,
  tags: string[]
) {
  // Create post
  const post = await table.entities.Post.put({
    username,
    title,
    content,
    published: true,
  }).execute();

  // Add tags
  await addTagsToPost(post.postId, tags);

  // Increment user post count
  await table.entities.User.update({ username }).add('postCount', 1).execute();

  return post;
}

// Usage
const post = await publishPostWithTags(
  'alice',
  'DynamoDB Best Practices',
  'Here are some best practices...',
  ['dynamodb', 'aws', 'database']
);
```

### Get Post with Comments

```typescript
async function getPostWithComments(username: string, postId: string) {
  const [post, comments, tags] = await Promise.all([
    getPost(username, postId),
    getPostComments(postId),
    getPostTags(postId),
  ]);

  return {
    ...post,
    comments,
    tags,
  };
}

// Usage
const fullPost = await getPostWithComments('alice', 'post123');
console.log(fullPost.title);
console.log(`${fullPost.comments.length} comments`);
console.log(`Tags: ${fullPost.tags.join(', ')}`);
```

### Get User Feed

```typescript
async function getUserFeed(username: string, page: number = 1, pageSize: number = 20) {
  const result = await table.entities.Post.query()
    .where((attr, op) => op.eq(attr.username, username))
    .limit(pageSize)
    .scanIndexForward(false)
    .executeWithPagination();

  return {
    posts: result.items,
    hasMore: !!result.lastEvaluatedKey,
    nextPageToken: result.lastEvaluatedKey,
  };
}
```

### Search Posts by Keyword (Simple)

```typescript
async function searchPosts(keyword: string) {
  // Note: This uses scan - not efficient for large tables
  // In production, use Elasticsearch or similar
  const allPosts = await table.entities.Post.scan()
    .where((attr, op) =>
      op.and(
        op.eq(attr.published, true),
        op.or(op.contains(attr.title, keyword), op.contains(attr.content, keyword))
      )
    )
    .execute();

  return allPosts;
}
```

## Pagination Example

```typescript
async function getPaginatedPosts(limit: number = 20, lastKey?: any) {
  let query = table.entities.Post.query()
    .where((attr, op) =>
      op.and(op.eq(attr.GSI1PK, 'POST'), op.beginsWith(attr.GSI1SK, 'STATUS#true'))
    )
    .useIndex('gsi1')
    .limit(limit)
    .scanIndexForward(false);

  if (lastKey) {
    query = query.startFrom(lastKey);
  }

  return await query.executeWithPagination();
}

// Usage - get first page
const page1 = await getPaginatedPosts(20);
console.log(page1.items);

// Get next page
if (page1.lastEvaluatedKey) {
  const page2 = await getPaginatedPosts(20, page1.lastEvaluatedKey);
  console.log(page2.items);
}
```

## Error Handling

```typescript
async function createPostSafely(username: string, title: string, content: string) {
  try {
    const post = await table.entities.Post.put({
      username,
      title,
      content,
    }).execute();

    return { success: true, post };
  } catch (error) {
    console.error('Failed to create post:', error);
    return { success: false, error: error.message };
  }
}
```

## Testing

```typescript
import { describe, it, expect, beforeAll } from 'vitest';

describe('Blog System', () => {
  beforeAll(async () => {
    // Setup test data
    await createUser('testuser', 'Test User', 'test@example.com');
  });

  it('should create a post', async () => {
    const post = await createPost('testuser', 'Test Post', 'Test content', true);

    expect(post.username).toBe('testuser');
    expect(post.title).toBe('Test Post');
    expect(post.postId).toBeDefined();
  });

  it('should get user posts', async () => {
    const posts = await getUserPosts('testuser');
    expect(posts.length).toBeGreaterThan(0);
  });

  it('should add comment to post', async () => {
    const posts = await getUserPosts('testuser');
    const post = posts[0];

    const comment = await addComment(post.postId, 'testuser', 'Test comment');

    expect(comment.content).toBe('Test comment');
  });
});
```

## Next Steps

This example demonstrates:

- ✅ Single-table design
- ✅ One-to-many relationships (User → Posts, Post → Comments)
- ✅ Many-to-many relationships (Posts ↔ Tags)
- ✅ GSI usage for alternative access patterns
- ✅ Pagination
- ✅ Atomic operations
- ✅ Type safety throughout

For more examples, see:

- [Instagram Clone](./instagram-clone)
