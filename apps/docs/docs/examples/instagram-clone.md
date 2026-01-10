---
sidebar_position: 2
---

# Instagram Clone

A complete example of an Instagram clone with users, photos, likes, comments, and follow relationships using Dynatable and Single Table Design.

## Entity-Relationship Diagram (ER)

```
┌─────────────┐         ┌─────────────┐
│    User     │         │    Photo    │
├─────────────┤         ├─────────────┤
│ username PK │◄───────┤│ username FK │
│ name        │    1:N ││ photoId  PK │
│ followerCnt │        ││ url         │
│ followingCnt│        ││ likesCount  │
└──────┬──────┘        ││ commentCount│
       │               │└──────┬──────┘
       │ N:M           │       │ 1:N
       │ (Follow)      │       │
       │               │       ▼
       │               │  ┌─────────────┐
       │               │  │   Comment   │
       │               │  ├─────────────┤
       │               │  │ photoId  FK │
       │               │  │ commentId PK│
       │               │  │ username FK │
       │               │  │ content     │
       │               │  └─────────────┘
       │               │
       │               │  ┌─────────────┐
       │               └─►│    Like     │
       │                  ├─────────────┤
       │                  │ photoId  FK │
       │                  │ username FK │
       └──────────────────┤ likeId   PK │
                          └─────────────┘
```

## Single Table Design

### Key Structure

| Entity Type | PK                          | SK                           | GSI1PK                       | GSI1SK                      |
| ----------- | --------------------------- | ---------------------------- | ---------------------------- | --------------------------- |
| User        | `USER#{username}`           | `USER#{username}`            | -                            | -                           |
| Photo       | `UP#{username}`             | `PHOTO#{photoId}`            | -                            | -                           |
| Like        | `PL#{photoId}`              | `LIKE#{likingUsername}`      | `PL#{photoId}`               | `LIKE#{likeId}`             |
| Comment     | `PC#{photoId}`              | `COMMENT#{commentId}`        | -                            | -                           |
| Follow      | `FOLLOW#{followedUsername}` | `FOLLOW#{followingUsername}` | `FOLLOW#{followingUsername}` | `FOLLOW#{followedUsername}` |

### Access Patterns

1. **User**
   - Get user by username: `GetItem` with PK=`USER#{username}`, SK=`USER#{username}`
   - Create unique user: `PutItem` with `attribute_not_exists` condition

2. **Photos**
   - Create photo: `PutItem` with PK=`UP#{username}`, SK=`PHOTO#{photoId}`
   - Get photo: `GetItem` with PK=`UP#{username}`, SK=`PHOTO#{photoId}`
   - List user photos: `Query` with PK=`UP#{username}`, SK `begins_with` "PHOTO#"

3. **Likes**
   - Like a photo: `TransactWrite` - Put Like + Update Photo.likesCount
   - Unlike photo: `TransactWrite` - Delete Like + Update Photo.likesCount
   - List likes (chronological): Query GSI1 with GSI1PK=`PL#{photoId}`
   - Check if user liked: `GetItem` with PK=`PL#{photoId}`, SK=`LIKE#{username}`

4. **Comments**
   - Comment on photo: `TransactWrite` - Put Comment + Update Photo.commentCount
   - List comments: `Query` with PK=`PC#{photoId}`, SK `begins_with` "COMMENT#"
   - Delete comment: `TransactWrite` - Delete Comment + Update Photo.commentCount

5. **Follow**
   - Follow user: `TransactWrite` - Put Follow + Update followerCount + Update followingCount
   - Unfollow user: `TransactWrite` - Delete Follow + Update followerCount + Update followingCount
   - List followers: `Query` with PK=`FOLLOW#{username}`, then `BatchGetItem` for user details
   - List following: Query GSI1 with GSI1PK=`FOLLOW#{username}`, then `BatchGetItem` for details

## Schema Definition

```typescript
import { Table } from 'dynatable';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const InstagramSchema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',

  indexes: {
    primary: { hash: 'PK', sort: 'SK' },
    gs1: { hash: 'GSI1PK', sort: 'GSI1SK' },
  },

  models: {
    User: {
      key: {
        pk: { type: String, value: 'USER#${username}' },
        sk: { type: String, value: 'USER#${username}' },
      },
      attributes: {
        username: { type: String, required: true },
        name: { type: String, required: true },
        followerCount: { type: Number, default: 0 },
        followingCount: { type: Number, default: 0 },
      },
    },

    Photo: {
      key: {
        pk: { type: String, value: 'UP#${username}' },
        sk: { type: String, value: 'PHOTO#${photoId}' },
      },
      attributes: {
        username: { type: String, required: true },
        photoId: { type: String, generate: 'ulid' },
        url: { type: String, required: true },
        caption: { type: String },
        likesCount: { type: Number, default: 0 },
        commentCount: { type: Number, default: 0 },
      },
    },

    Like: {
      key: {
        pk: { type: String, value: 'PL#${photoId}' },
        sk: { type: String, value: 'LIKE#${likingUsername}' },
      },
      index: {
        gs1pk: { type: String, value: 'PL#${photoId}' },
        gs1sk: { type: String, value: 'LIKE#${likeId}' },
      },
      attributes: {
        photoId: { type: String, required: true },
        likingUsername: { type: String, required: true },
        likeId: { type: String, generate: 'ulid', required: true },
      },
    },

    Comment: {
      key: {
        pk: { type: String, value: 'PC#${photoId}' },
        sk: { type: String, value: 'COMMENT#${commentId}' },
      },
      attributes: {
        photoId: { type: String, required: true },
        commentId: { type: String, generate: 'ulid', required: true },
        commentingUsername: { type: String, required: true },
        content: { type: String, required: true },
      },
    },

    Follow: {
      key: {
        pk: { type: String, value: 'FOLLOW#${followedUsername}' },
        sk: { type: String, value: 'FOLLOW#${followingUsername}' },
      },
      index: {
        gs1pk: { type: String, value: 'FOLLOW#${followingUsername}' },
        gs1sk: { type: String, value: 'FOLLOW#${followedUsername}' },
      },
      attributes: {
        followedUsername: { type: String, required: true },
        followingUsername: { type: String, required: true },
      },
    },
  },

  params: {
    isoDates: true,
    timestamps: true,
  },
} as const;

export const table = new Table({
  name: 'InstagramClone',
  client: new DynamoDBClient({ region: 'us-east-1' }),
  schema: InstagramSchema,
});
```

## User Operations

### Create User

```typescript
async function createUser(username: string, name: string) {
  return await table.entities.User.put({
    username,
    name,
  })
    .ifNotExists()
    .execute();
}

// Usage
await createUser('juanca', 'Juan Carlos Bondi');
```

### Get User Profile

```typescript
async function getUserProfile(username: string) {
  return await table.entities.User.get({
    username,
  }).execute();
}

// Usage
const user = await getUserProfile('juanca');
console.log(user.name, user.followerCount);
```

### Update User Profile

```typescript
async function updateUserProfile(username: string, updates: { name?: string }) {
  let query = table.entities.User.update({ username });

  if (updates.name) {
    query = query.set('name', updates.name);
  }

  return await query.returning('ALL_NEW').execute();
}

// Usage
await updateUserProfile('juanca', {
  name: 'Juan Carlos Bondi - Photographer',
});
```

## Photo Operations

### Create Photo

```typescript
async function createPhoto(username: string, url: string, caption?: string) {
  return await table.entities.Photo.put({
    username,
    url,
    caption,
  }).execute();
}

// Usage
const photo = await createPhoto(
  'juanca',
  'https://photos.app.goo.gl/abcd1234',
  'Sunset at the beach!'
);

console.log(photo.photoId); // Auto-generated ULID
```

### Get Photo

```typescript
async function getPhoto(username: string, photoId: string) {
  return await table.entities.Photo.get({
    username,
    photoId,
  }).execute();
}

// Usage
const photo = await getPhoto('juanca', '01K16ZP43BRX67DG50SHGZ11DS');
console.log(photo.url, photo.likesCount);
```

### List User Photos

```typescript
async function getUserPhotos(username: string, limit: number = 20) {
  return await table.entities.Photo.query()
    .where((attr, op) => op.eq(attr.username, username))
    .limit(limit)
    .scanIndexForward(false) // Most recent first
    .execute();
}

// Usage
const photos = await getUserPhotos('juanca', 12);
photos.forEach((photo) => {
  console.log(photo.url, photo.caption, photo.createdAt);
});
```

### List Popular User Photos

```typescript
async function getPopularUserPhotos(username: string, minLikes: number = 10) {
  return await table.entities.Photo.query()
    .where((attr, op) => op.and(op.eq(attr.username, username), op.gt(attr.likesCount, minLikes)))
    .scanIndexForward(false)
    .execute();
}

// Usage
const popularPhotos = await getPopularUserPhotos('juanca', 50);
```

### Delete Photo

```typescript
async function deletePhoto(username: string, photoId: string) {
  return await table.entities.Photo.delete({
    username,
    photoId,
  }).execute();
}
```

## Like Operations

### Like a Photo

```typescript
async function likePhoto(photoId: string, photoOwner: string, likingUsername: string) {
  // Use transaction for atomicity
  return await table
    .transactWrite()
    .addPut(
      table.entities.Like.put({
        photoId,
        likingUsername,
      })
        .ifNotExists()
        .dbParams()
    )
    .addUpdate(
      table.entities.Photo.update({
        username: photoOwner,
        photoId,
      })
        .add('likesCount', 1)
        .dbParams()
    )
    .execute();
}

// Usage
await likePhoto('photo123', 'juanca', 'alice');
```

### Unlike a Photo

```typescript
async function unlikePhoto(photoId: string, photoOwner: string, likingUsername: string) {
  return await table
    .transactWrite()
    .addDelete(
      table.entities.Like.delete({
        photoId,
        likingUsername,
      }).dbParams()
    )
    .addUpdate(
      table.entities.Photo.update({
        username: photoOwner,
        photoId,
      })
        .add('likesCount', -1)
        .dbParams()
    )
    .execute();
}

// Usage
await unlikePhoto('photo123', 'juanca', 'alice');
```

### Check if User Liked Photo

```typescript
async function hasUserLikedPhoto(photoId: string, username: string): Promise<boolean> {
  try {
    const like = await table.entities.Like.get({
      photoId,
      likingUsername: username,
    }).execute();

    return !!like;
  } catch (error) {
    return false;
  }
}

// Usage
const hasLiked = await hasUserLikedPhoto('photo123', 'alice');
console.log(hasLiked ? 'Already liked' : 'Not liked yet');
```

### List Users Who Liked (Chronological)

```typescript
async function getPhotoLikes(photoId: string, limit: number = 50) {
  // Use GSI1 to sort by likeId (timestamp)
  const likes = await table.entities.Like.query()
    .where((attr, op) => op.eq(attr.photoId, photoId))
    .useIndex('gs1')
    .limit(limit)
    .scanIndexForward(true) // Oldest first
    .execute();

  // Get user details
  if (likes.length > 0) {
    const users = await table.entities.User.batchGet(
      likes.map((like) => ({ username: like.likingUsername }))
    ).execute();

    return users;
  }

  return [];
}

// Usage
const likers = await getPhotoLikes('photo123', 20);
likers.forEach((user) => {
  console.log(user.username, user.name);
});
```

## Comment Operations

### Comment on Photo

```typescript
async function commentOnPhoto(
  photoId: string,
  photoOwner: string,
  commentingUsername: string,
  content: string
) {
  return await table
    .transactWrite()
    .addPut(
      table.entities.Comment.put({
        photoId,
        commentingUsername,
        content,
      }).dbParams()
    )
    .addUpdate(
      table.entities.Photo.update({
        username: photoOwner,
        photoId,
      })
        .add('commentCount', 1)
        .dbParams()
    )
    .execute();
}

// Usage
await commentOnPhoto('photo123', 'juanca', 'alice', 'Amazing photo! Love the colors!');
```

### List Photo Comments

```typescript
async function getPhotoComments(photoId: string, limit: number = 50) {
  const comments = await table.entities.Comment.query()
    .where((attr, op) => op.eq(attr.photoId, photoId))
    .limit(limit)
    .scanIndexForward(true) // Oldest first
    .execute();

  // Optionally get user details
  if (comments.length > 0) {
    const users = await table.entities.User.batchGet(
      comments.map((c) => ({ username: c.commentingUsername }))
    ).execute();

    // Combine comments with user data
    return comments.map((comment) => ({
      ...comment,
      user: users.find((u) => u.username === comment.commentingUsername),
    }));
  }

  return [];
}

// Usage
const comments = await getPhotoComments('photo123', 20);
comments.forEach((comment) => {
  console.log(`${comment.user?.name}: ${comment.content}`);
});
```

### Delete Comment

```typescript
async function deleteComment(photoId: string, commentId: string, photoOwner: string) {
  return await table
    .transactWrite()
    .addDelete(
      table.entities.Comment.delete({
        photoId,
        commentId,
      }).dbParams()
    )
    .addUpdate(
      table.entities.Photo.update({
        username: photoOwner,
        photoId,
      })
        .add('commentCount', -1)
        .dbParams()
    )
    .execute();
}
```

### Update Comment

```typescript
async function updateComment(
  photoId: string,
  commentId: string,
  commentingUsername: string,
  newContent: string
) {
  return await table.entities.Comment.update({
    photoId,
    commentId,
  })
    .set('content', newContent)
    .where((attr, op) => op.eq(attr.commentingUsername, commentingUsername))
    .returning('ALL_NEW')
    .execute();
}

// Usage
await updateComment(
  'photo123',
  'comment456',
  'alice',
  'Updated: Amazing photo! Love the composition!'
);
```

## Follow Operations

### Follow User

```typescript
async function followUser(followingUsername: string, followedUsername: string) {
  return await table
    .transactWrite()
    .addPut(
      table.entities.Follow.put({
        followingUsername,
        followedUsername,
      })
        .ifNotExists()
        .dbParams()
    )
    .addUpdate(
      table.entities.User.update({
        username: followedUsername,
      })
        .add('followerCount', 1)
        .dbParams()
    )
    .addUpdate(
      table.entities.User.update({
        username: followingUsername,
      })
        .add('followingCount', 1)
        .dbParams()
    )
    .execute();
}

// Usage: Alice follows Juan Carlos
await followUser('alice', 'juanca');
```

### Unfollow User

```typescript
async function unfollowUser(followingUsername: string, followedUsername: string) {
  return await table
    .transactWrite()
    .addDelete(
      table.entities.Follow.delete({
        followingUsername,
        followedUsername,
      }).dbParams()
    )
    .addUpdate(
      table.entities.User.update({
        username: followedUsername,
      })
        .add('followerCount', -1)
        .dbParams()
    )
    .addUpdate(
      table.entities.User.update({
        username: followingUsername,
      })
        .add('followingCount', -1)
        .dbParams()
    )
    .execute();
}

// Usage
await unfollowUser('alice', 'juanca');
```

### List User Followers

```typescript
async function getFollowers(username: string, limit: number = 50) {
  // Query to get follow relationships
  const follows = await table.entities.Follow.query()
    .where((attr, op) => op.eq(attr.followedUsername, username))
    .limit(limit)
    .execute();

  if (follows.length === 0) return [];

  // BatchGet to get user details
  const followers = await table.entities.User.batchGet(
    follows.map((f) => ({ username: f.followingUsername }))
  ).execute();

  return followers;
}

// Usage
const followers = await getFollowers('juanca', 20);
console.log(`${followers.length} followers`);
followers.forEach((user) => {
  console.log(user.username, user.name);
});
```

### List Following Users

```typescript
async function getFollowing(username: string, limit: number = 50) {
  // Query on GSI1 to get followed users
  const follows = await table.entities.Follow.query()
    .where((attr, op) => op.eq(attr.followingUsername, username))
    .useIndex('gs1')
    .limit(limit)
    .execute();

  if (follows.length === 0) return [];

  // BatchGet to get user details
  const following = await table.entities.User.batchGet(
    follows.map((f) => ({ username: f.followedUsername }))
  ).execute();

  return following;
}

// Usage
const following = await getFollowing('alice', 20);
console.log(`Following ${following.length} users`);
```

### Check if User Follows Another

```typescript
async function isFollowing(followingUsername: string, followedUsername: string): Promise<boolean> {
  try {
    const follow = await table.entities.Follow.get({
      followingUsername,
      followedUsername,
    }).execute();

    return !!follow;
  } catch (error) {
    return false;
  }
}

// Usage
const following = await isFollowing('alice', 'juanca');
console.log(following ? 'Following' : 'Not following');
```

## Complete Workflows

### User Feed (Photos from Followed Users)

```typescript
async function getUserFeed(username: string, limit: number = 30) {
  // 1. Get followed users
  const following = await getFollowing(username, 100);

  if (following.length === 0) return [];

  // 2. Get photos from each followed user
  const photoPromises = following.map((user) => getUserPhotos(user.username, 10));

  const photosByUser = await Promise.all(photoPromises);

  // 3. Combine and sort by date
  const allPhotos = photosByUser.flat();
  allPhotos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 4. Return first N photos
  return allPhotos.slice(0, limit);
}

// Usage
const feed = await getUserFeed('alice', 20);
feed.forEach((photo) => {
  console.log(`${photo.username}: ${photo.caption}`);
});
```

### Get Photo with Full Details

```typescript
async function getPhotoWithDetails(username: string, photoId: string) {
  const [photo, comments, likeCount] = await Promise.all([
    getPhoto(username, photoId),
    getPhotoComments(photoId, 20),
    getPhotoLikes(photoId, 20),
  ]);

  return {
    ...photo,
    comments: comments.slice(0, 3), // First 3 comments
    commentCount: photo.commentCount,
    recentLikers: likeCount.slice(0, 5), // First 5 who liked
    totalLikes: photo.likesCount,
  };
}

// Usage
const photoDetails = await getPhotoWithDetails('juanca', 'photo123');
console.log(photoDetails.caption);
console.log(`${photoDetails.totalLikes} likes, ${photoDetails.commentCount} comments`);
```

### Complete User Profile

```typescript
async function getCompleteUserProfile(username: string) {
  const [user, photos, followers, following] = await Promise.all([
    getUserProfile(username),
    getUserPhotos(username, 12), // Last 12 photos
    getFollowers(username, 100),
    getFollowing(username, 100),
  ]);

  return {
    ...user,
    photos,
    photoCount: photos.length,
    followers,
    following,
  };
}

// Usage
const profile = await getCompleteUserProfile('juanca');
console.log(`${profile.name} (@${profile.username})`);
console.log(`${profile.followerCount} followers, ${profile.followingCount} following`);
console.log(`${profile.photoCount} photos`);
```

### Search User Photos

```typescript
async function searchUserPhotos(username: string, minLikes?: number, minComments?: number) {
  let query = table.entities.Photo.query()
    .where((attr, op) => {
      const conditions = [op.eq(attr.username, username)];

      if (minLikes !== undefined) {
        conditions.push(op.gt(attr.likesCount, minLikes));
      }

      if (minComments !== undefined) {
        conditions.push(op.gt(attr.commentCount, minComments));
      }

      return conditions.length > 1 ? op.and(...conditions) : conditions[0];
    })
    .scanIndexForward(false);

  return await query.execute();
}

// Usage: Search photos with more than 100 likes
const popularPhotos = await searchUserPhotos('juanca', 100);
```

## Pagination

### User Photos with Pagination

```typescript
async function getUserPhotosPaginated(username: string, limit: number = 20, lastKey?: any) {
  let query = table.entities.Photo.query()
    .where((attr, op) => op.eq(attr.username, username))
    .limit(limit)
    .scanIndexForward(false);

  if (lastKey) {
    query = query.startFrom(lastKey);
  }

  return await query.executeWithPagination();
}

// Usage - first page
const page1 = await getUserPhotosPaginated('juanca', 12);
console.log(page1.items);

// Next page
if (page1.lastEvaluatedKey) {
  const page2 = await getUserPhotosPaginated('juanca', 12, page1.lastEvaluatedKey);
  console.log(page2.items);
}
```

### Comments with Pagination

```typescript
async function getPhotoCommentsPaginated(photoId: string, limit: number = 20, lastKey?: any) {
  let query = table.entities.Comment.query()
    .where((attr, op) => op.eq(attr.photoId, photoId))
    .limit(limit)
    .scanIndexForward(true);

  if (lastKey) {
    query = query.startFrom(lastKey);
  }

  const result = await query.executeWithPagination();

  // Get user details for this page
  if (result.items.length > 0) {
    const users = await table.entities.User.batchGet(
      result.items.map((c) => ({ username: c.commentingUsername }))
    ).execute();

    const commentsWithUsers = result.items.map((comment) => ({
      ...comment,
      user: users.find((u) => u.username === comment.commentingUsername),
    }));

    return {
      items: commentsWithUsers,
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }

  return result;
}
```

## Error Handling

```typescript
async function likePhotoSafely(photoId: string, photoOwner: string, likingUsername: string) {
  try {
    await likePhoto(photoId, photoOwner, likingUsername);
    return { success: true };
  } catch (error: any) {
    if (error.code === 'TransactionCanceledException') {
      // Already liked before
      return {
        success: false,
        error: 'Already liked this photo',
      };
    }

    console.error('Failed to like photo:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function createPhotoSafely(username: string, url: string, caption?: string) {
  try {
    const photo = await createPhoto(username, url, caption);
    return { success: true, photo };
  } catch (error: any) {
    console.error('Failed to create photo:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
```

## Testing

```typescript
import { describe, it, expect, beforeAll } from 'vitest';

describe('Instagram Clone', () => {
  beforeAll(async () => {
    // Setup test data
    await createUser('testuser1', 'Test User 1');
    await createUser('testuser2', 'Test User 2');
  });

  it('should create a photo', async () => {
    const photo = await createPhoto('testuser1', 'https://example.com/photo.jpg', 'Test caption');

    expect(photo.username).toBe('testuser1');
    expect(photo.photoId).toBeDefined();
    expect(photo.caption).toBe('Test caption');
  });

  it('should allow user to follow another user', async () => {
    await followUser('testuser2', 'testuser1');

    const user1 = await getUserProfile('testuser1');
    const user2 = await getUserProfile('testuser2');

    expect(user1.followerCount).toBe(1);
    expect(user2.followingCount).toBe(1);
  });

  it('should like a photo', async () => {
    const photo = await createPhoto('testuser1', 'https://example.com/photo2.jpg');

    await likePhoto(photo.photoId, 'testuser1', 'testuser2');

    const updatedPhoto = await getPhoto('testuser1', photo.photoId);
    expect(updatedPhoto.likesCount).toBe(1);
  });

  it('should add comment to photo', async () => {
    const photo = await createPhoto('testuser1', 'https://example.com/photo3.jpg');

    await commentOnPhoto(photo.photoId, 'testuser1', 'testuser2', 'Great photo!');

    const comments = await getPhotoComments(photo.photoId);
    expect(comments.length).toBe(1);
    expect(comments[0].content).toBe('Great photo!');
  });
});
```

## Features Demonstrated

This example demonstrates:

- ✅ **Single Table Design** - All entities in one table
- ✅ **1:N Relationships** - User → Photos, Photo → Comments
- ✅ **N:M Relationships** - Users ↔ Followers (Follow)
- ✅ **GSI Usage** - Alternative access patterns
- ✅ **Atomic Transactions** - Like, Follow with counters
- ✅ **Auto-generated IDs** - ULID for photos, likes, comments
- ✅ **Automatic Timestamps** - createdAt, updatedAt
- ✅ **Pagination** - For long lists
- ✅ **BatchGet** - Efficiently fetch multiple users
- ✅ **Type Safety** - TypeScript end-to-end
- ✅ **Conditions** - ifNotExists, where conditions
- ✅ **Atomic Counters** - followerCount, likesCount, commentCount

## Single Table Design Benefits

1. **Performance**: Fewer round-trips to the database
2. **Transactions**: Atomic operations between related entities
3. **Cost**: Lower RCU/WCU consumption
4. **Scalability**: Uniform load distribution
5. **Maintenance**: Single table to manage

## Next Steps

To enhance this example, consider:

- Implement Stories (temporary content)
- Add Direct Messages between users
- Implement hashtags for photos
- Add notifications
- Implement user search
- Add saved posts (bookmarked photos)

## References

- [Blog System Example](./blog-system)
- [Single Table Design Guide](../guides/single-table-design)
- [Data Modeling Guide](../guides/data-modeling)
- [Queries Guide](../guides/queries)
- [Mutations Guide](../guides/mutations)
