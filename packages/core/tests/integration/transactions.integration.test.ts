import { Table } from '../../src/table';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * Instagram Clone Schema - same as demo.instagram.test.ts
 */
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
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'USER#${username}' },
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
        PK: { type: String, value: 'UP#${username}' },
        SK: { type: String, value: 'PHOTO#${photoId}' },
      },
      attributes: {
        username: { type: String, required: true },
        photoId: { type: String, generate: 'ulid' },
        url: { type: String, required: true },
        likesCount: { type: Number, default: 0 },
        commentCount: { type: Number, default: 0 },
      },
    },

    Like: {
      key: {
        PK: { type: String, value: 'PL#${photoId}' },
        SK: { type: String, value: 'LIKE#${likingUsername}' },
      },
      index: {
        gs1PK: { type: String, value: 'PL#${photoId}' },
        gs1SK: { type: String, value: 'LIKE#${likeId}' },
      },
      attributes: {
        photoId: { type: String, required: true },
        likingUsername: { type: String, required: true },
        likeId: { type: String, generate: 'ulid' },
      },
    },

    Comment: {
      key: {
        PK: { type: String, value: 'PC#${photoId}' },
        SK: { type: String, value: 'COMMENT#${commentId}' },
      },
      attributes: {
        photoId: { type: String, required: true },
        commentId: { type: String, generate: 'ulid' },
        commentingUsername: { type: String, required: true },
        content: { type: String, required: true },
      },
    },

    Follow: {
      key: {
        PK: { type: String, value: 'FOLLOW#${followedUsername}' },
        SK: { type: String, value: 'FOLLOW#${followingUsername}' },
      },
      index: {
        gs1PK: { type: String, value: 'FOLLOW#${followingUsername}' },
        gs1SK: { type: String, value: 'FOLLOW#${followedUsername}' },
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

const table = new Table({
  name: 'InstagramClone',
  client: new DynamoDBClient({}),
  schema: InstagramSchema,
});

jest.mock('ulid', () => ({
  ulid: jest.fn(() => '01K16ZP43BRX67DG50SHGZ11DS'),
}));

describe('Transactions Integration Tests - Instagram Schema', () => {
  describe('TransactWrite - Real World Use Cases', () => {
    test('Like a Photo (Put Like + Update Photo.likesCount)', () => {
      // This is an atomic operation: both must succeed or both fail
      const params = table
        .transactWrite()
        .addPut(
          table.entities.Like.put({
            photoId: 'photo123',
            likingUsername: 'juanca',
          })
            .ifNotExists()
            .dbParams()
        )
        .addUpdate(
          table.entities.Photo.update({
            username: 'alice',
            photoId: 'photo123',
          })
            .add('likesCount', 1)
            .dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(2);

      // Verify Put operation
      expect(params.TransactItems[0]).toHaveProperty('Put');
      expect(params.TransactItems[0]?.Put.Item).toMatchObject({
        photoId: 'photo123',
        likingUsername: 'juanca',
        PK: 'PL#photo123',
        SK: 'LIKE#juanca',
      });
      expect(params.TransactItems[0]?.Put.ConditionExpression).toContain('attribute_not_exists');

      // Verify Update operation
      expect(params.TransactItems[1]).toHaveProperty('Update');
      expect(params.TransactItems[1]?.Update.Key).toEqual({
        PK: 'UP#alice',
        SK: 'PHOTO#photo123',
      });
      expect(params.TransactItems[1]?.Update.UpdateExpression).toContain(
        'ADD #likesCount :likesCount_0'
      );
      // Should also include updatedAt timestamp
      expect(params.TransactItems[1]?.Update.UpdateExpression).toContain(
        'SET #updatedAt = :updatedAt_ts'
      );
    });

    test('Follow a User (Put Follow + Update both user counts)', () => {
      const params = table
        .transactWrite()
        .addPut(
          table.entities.Follow.put({
            followedUsername: 'alice',
            followingUsername: 'bob',
          })
            .ifNotExists()
            .dbParams()
        )
        .addUpdate(
          table.entities.User.update({ username: 'alice' }).add('followerCount', 1).dbParams()
        )
        .addUpdate(
          table.entities.User.update({ username: 'bob' }).add('followingCount', 1).dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(3);

      // Put Follow
      expect(params.TransactItems[0]?.Put.Item).toMatchObject({
        followedUsername: 'alice',
        followingUsername: 'bob',
        PK: 'FOLLOW#alice',
        SK: 'FOLLOW#bob',
      });

      // Update alice's followerCount
      expect(params.TransactItems[1]?.Update.Key).toEqual({
        PK: 'USER#alice',
        SK: 'USER#alice',
      });
      expect(params.TransactItems[1]?.Update.UpdateExpression).toContain('followerCount');

      // Update bob's followingCount
      expect(params.TransactItems[2]?.Update.Key).toEqual({
        PK: 'USER#bob',
        SK: 'USER#bob',
      });
      expect(params.TransactItems[2]?.Update.UpdateExpression).toContain('followingCount');
    });

    test('Comment on Photo (Put Comment + Update Photo.commentCount)', () => {
      const params = table
        .transactWrite()
        .addPut(
          table.entities.Comment.put({
            photoId: 'photo123',
            commentingUsername: 'bob',
            content: 'Great photo!',
          }).dbParams()
        )
        .addUpdate(
          table.entities.Photo.update({
            username: 'alice',
            photoId: 'photo123',
          })
            .add('commentCount', 1)
            .dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(2);

      // Put Comment
      expect(params.TransactItems[0]?.Put.Item).toMatchObject({
        photoId: 'photo123',
        commentingUsername: 'bob',
        content: 'Great photo!',
        PK: 'PC#photo123',
      });

      // Update Photo commentCount
      expect(params.TransactItems[1]?.Update.UpdateExpression).toContain(
        'ADD #commentCount :commentCount_0'
      );
      // Should also include updatedAt timestamp
      expect(params.TransactItems[1]?.Update.UpdateExpression).toContain(
        'SET #updatedAt = :updatedAt_ts'
      );
    });

    test('Delete Photo with safety check (only if no likes or comments)', () => {
      const params = table
        .transactWrite()
        .addDelete(
          table.entities.Photo.delete({
            username: 'alice',
            photoId: 'photo123',
          })
            .where((attr, op) => op.and(op.eq(attr.likesCount, 0), op.eq(attr.commentCount, 0)))
            .dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(1);
      expect(params.TransactItems[0]?.Delete.Key).toEqual({
        PK: 'UP#alice',
        SK: 'PHOTO#photo123',
      });
      expect(params.TransactItems[0]?.Delete.ConditionExpression).toMatch(
        /likesCount.*commentCount/
      );
    });

    test('Create User with admin existence check', () => {
      // Only create user if admin exists (business rule)
      const params = table
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
          TableName: 'InstagramClone',
          Key: { PK: 'USER#admin', SK: 'USER#admin' },
          ConditionExpression: 'attribute_exists(#PK)',
          ExpressionAttributeNames: { '#PK': 'PK' },
        })
        .dbParams();

      expect(params.TransactItems).toHaveLength(2);
      expect(params.TransactItems[0]).toHaveProperty('Put');
      expect(params.TransactItems[1]).toHaveProperty('ConditionCheck');
    });

    test('Unlike Photo (Delete Like + Decrement Photo.likesCount)', () => {
      const params = table
        .transactWrite()
        .addDelete(
          table.entities.Like.delete({
            photoId: 'photo123',
            likingUsername: 'juanca',
          }).dbParams()
        )
        .addUpdate(
          table.entities.Photo.update({
            username: 'alice',
            photoId: 'photo123',
          })
            .add('likesCount', -1)
            .dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(2);

      // Delete Like
      expect(params.TransactItems[0]?.Delete.Key).toEqual({
        PK: 'PL#photo123',
        SK: 'LIKE#juanca',
      });

      // Update Photo (decrement)
      expect(params.TransactItems[1]?.Update.Key).toEqual({
        PK: 'UP#alice',
        SK: 'PHOTO#photo123',
      });
      expect(params.TransactItems[1]?.Update.UpdateExpression).toContain(
        'ADD #likesCount :likesCount_0'
      );
      expect(params.TransactItems[1]?.Update.UpdateExpression).toContain(
        'SET #updatedAt = :updatedAt_ts'
      );
      expect(params.TransactItems[1]?.Update.ExpressionAttributeValues).toHaveProperty(
        ':likesCount_0'
      );
    });

    test('Unfollow User (Delete Follow + Update both counts)', () => {
      const params = table
        .transactWrite()
        .addDelete(
          table.entities.Follow.delete({
            followedUsername: 'alice',
            followingUsername: 'bob',
          }).dbParams()
        )
        .addUpdate(
          table.entities.User.update({ username: 'alice' })
            .add('followerCount', -1)
            .where((attr, op) => op.gte(attr.followerCount, 1))
            .dbParams()
        )
        .addUpdate(
          table.entities.User.update({ username: 'bob' })
            .add('followingCount', -1)
            .where((attr, op) => op.gte(attr.followingCount, 1))
            .dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(3);
    });

    test('Builder immutability - chaining creates new instances', () => {
      const builder1 = table.transactWrite();
      const builder2 = builder1.addPut(
        table.entities.User.put({
          username: 'alice',
          name: 'Alice',
        }).dbParams()
      );
      const builder3 = builder2.addUpdate(
        table.entities.User.update({ username: 'bob' }).add('followerCount', 1).dbParams()
      );

      // Original builder unchanged
      expect(builder1.dbParams().TransactItems).toHaveLength(0);
      expect(builder2.dbParams().TransactItems).toHaveLength(1);
      expect(builder3.dbParams().TransactItems).toHaveLength(2);
    });
  });

  describe('TransactGet - Real World Use Cases', () => {
    test('Get User + Photo atomically', () => {
      const params = table
        .transactGet()
        .addGet(table.entities.User.get({ username: 'alice' }).dbParams())
        .addGet(
          table.entities.Photo.get({
            username: 'alice',
            photoId: 'photo123',
          }).dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(2);

      // Get User
      expect(params.TransactItems[0]?.Get.Key).toEqual({
        PK: 'USER#alice',
        SK: 'USER#alice',
      });

      // Get Photo
      expect(params.TransactItems[1]?.Get.Key).toEqual({
        PK: 'UP#alice',
        SK: 'PHOTO#photo123',
      });
    });

    test('Get Follow relationship + both Users', () => {
      const params = table
        .transactGet()
        .addGet(
          table.entities.Follow.get({
            followedUsername: 'alice',
            followingUsername: 'bob',
          }).dbParams()
        )
        .addGet(table.entities.User.get({ username: 'alice' }).dbParams())
        .addGet(table.entities.User.get({ username: 'bob' }).dbParams())
        .dbParams();

      expect(params.TransactItems).toHaveLength(3);

      // Follow
      expect(params.TransactItems[0]?.Get.Key).toEqual({
        PK: 'FOLLOW#alice',
        SK: 'FOLLOW#bob',
      });

      // Users
      expect(params.TransactItems[1]?.Get.Key.PK).toBe('USER#alice');
      expect(params.TransactItems[2]?.Get.Key.PK).toBe('USER#bob');
    });

    test('Get Photo + Like + Comment atomically', () => {
      const params = table
        .transactGet()
        .addGet(
          table.entities.Photo.get({
            username: 'alice',
            photoId: 'photo123',
          }).dbParams()
        )
        .addGet(
          table.entities.Like.get({
            photoId: 'photo123',
            likingUsername: 'bob',
          }).dbParams()
        )
        .addGet(
          table.entities.Comment.get({
            photoId: 'photo123',
            commentId: 'comment456',
          }).dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(3);

      // Photo
      expect(params.TransactItems[0]?.Get.Key).toEqual({
        PK: 'UP#alice',
        SK: 'PHOTO#photo123',
      });

      // Like
      expect(params.TransactItems[1]?.Get.Key).toEqual({
        PK: 'PL#photo123',
        SK: 'LIKE#bob',
      });

      // Comment
      expect(params.TransactItems[2]?.Get.Key).toEqual({
        PK: 'PC#photo123',
        SK: 'COMMENT#comment456',
      });
    });

    test('Builder immutability - chaining creates new instances', () => {
      const builder1 = table.transactGet();
      const builder2 = builder1.addGet(table.entities.User.get({ username: 'alice' }).dbParams());
      const builder3 = builder2.addGet(table.entities.User.get({ username: 'bob' }).dbParams());

      // Original builder unchanged
      expect(builder1.dbParams().TransactItems).toHaveLength(0);
      expect(builder2.dbParams().TransactItems).toHaveLength(1);
      expect(builder3.dbParams().TransactItems).toHaveLength(2);
    });
  });

  describe('Mixed Transaction Scenarios', () => {
    test('Complex social interaction - Like with notification', () => {
      // Like photo + increment count + update follower count
      const params = table
        .transactWrite()
        .addPut(
          table.entities.Like.put({
            photoId: 'photo123',
            likingUsername: 'charlie',
          })
            .ifNotExists()
            .dbParams()
        )
        .addUpdate(
          table.entities.Photo.update({
            username: 'alice',
            photoId: 'photo123',
          })
            .add('likesCount', 1)
            .dbParams()
        )
        .addUpdate(
          table.entities.User.update({ username: 'alice' })
            .add('followerCount', 0) // Just to demonstrate multiple updates
            .dbParams()
        )
        .dbParams();

      expect(params.TransactItems).toHaveLength(3);
    });

    test('Client request token for idempotency', () => {
      const params = table
        .transactWrite()
        .addPut(
          table.entities.User.put({
            username: 'alice',
            name: 'Alice',
          }).dbParams()
        )
        .withClientRequestToken('unique-request-id-12345')
        .dbParams();

      expect(params.ClientRequestToken).toBe('unique-request-id-12345');
    });
  });
});
