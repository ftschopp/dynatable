/* eslint-disable @typescript-eslint/no-explicit-any */
import { Table } from '../../src/table';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * DynamoDB Schema for Instagram Clone
 *
 * Single Table Design with the following access patterns:
 * - Get User by username
 * - Get Photo by username and photoId
 * - List Photos by User (reverse chronological)
 * - Like a Photo (enforce uniqueness per user)
 * - List Likes for a Photo (chronological by likeId)
 * - Comment on a Photo
 * - List Comments for a Photo
 * - Follow a User
 * - List Followers of a User
 * - List Users followed by a User
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
        PK: { type: String, value: 'PC#${photoId}' },
        SK: { type: String, value: 'COMMENT#${commentId}' },
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
        PK: { type: String, value: 'FOLLOW#${followedUsername}' },
        SK: { type: String, value: 'FOLLOW#${followingUsername}' },
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

/**
 * Access Patterns Summary:
 *
 * 1. User Operations:
 *    - Create User: PutItem with PK=USER#{username}, SK=USER#{username}
 *    - Get User: GetItem with PK=USER#{username}, SK=USER#{username}
 *
 * 2. Photo Operations:
 *    - Create Photo: PutItem with PK=UP#{username}, SK=PHOTO#{photoId}
 *    - Get Photo: GetItem with PK=UP#{username}, SK=PHOTO#{photoId}
 *    - List User Photos: Query with PK=UP#{username}, SK begins_with "PHOTO#"
 *
 * 3. Like Operations:
 *    - Like Photo: TransactWrite - Put Like + Update Photo.likesCount
 *      - PK=PL#{photoId}, SK=LIKE#{likingUsername}
 *    - List Likes (chronological): Query GSI1 with GSI1PK=PL#{photoId}
 *
 * 4. Comment Operations:
 *    - Comment on Photo: TransactWrite - Put Comment + Update Photo.commentCount
 *      - PK=PC#{photoId}, SK=COMMENT#{commentId}
 *    - List Comments: Query with PK=PC#{photoId}, SK begins_with "COMMENT#"
 *
 * 5. Follow Operations:
 *    - Follow User: TransactWrite - Put Follow + Update followerCount + Update followingCount
 *      - PK=FOLLOW#{followedUsername}, SK=FOLLOW#{followingUsername}
 *    - List Followers: Query with PK=FOLLOW#{username}, then BatchGetItem for User details
 *    - List Following: Query GSI1 with GSI1PK=FOLLOW#{username}, then BatchGetItem for User details
 */

const table = new Table({
  name: 'InstagramClone',
  client: new DynamoDBClient({}),
  schema: InstagramSchema,
});

jest.mock('ulid', () => ({
  ulid: jest.fn(() => '01K16ZP43BRX67DG50SHGZ11DS'),
}));
describe('Should test dbParams function builder', () => {
  test('Get User by Username', async () => {
    const params = await table.entities.User.get({
      username: 'juanca',
    }).dbParams();

    expect(params).toEqual({
      TableName: 'InstagramClone',
      Key: {
        PK: 'USER#juanca',
        SK: 'USER#juanca',
      },
    });
  });
  test('should fail when trying to get user without required username', async () => {
    expect(() => {
      table.entities.User.get({} as any);
    }).toThrow(
      '[User] Missing required key field(s) for get(): username. Required fields: username'
    );
  });

  test('Create User uniqueness', async () => {
    const params = await table.entities.User.put({
      name: 'Juan Carlos Bondi',
      username: 'juanca',
    })
      .ifNotExists()
      .dbParams();

    expect(params).toMatchObject({
      TableName: 'InstagramClone',
      Item: expect.objectContaining({
        username: 'juanca',
        name: 'Juan Carlos Bondi',
        followerCount: 0,
        followingCount: 0,
        PK: 'USER#juanca',
        SK: 'USER#juanca',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
      ConditionExpression: '(attribute_not_exists(#PK)) AND (attribute_not_exists(#SK))',
      ExpressionAttributeNames: {
        '#PK': 'PK',
        '#SK': 'SK',
      },
    });
  });
  test('Upsert User', async () => {
    const params = await table.entities.User.put({
      name: 'Juan Carlos Bondi',
      username: 'juanca',
    }).dbParams();

    expect(params).toMatchObject({
      TableName: 'InstagramClone',
      Item: expect.objectContaining({
        username: 'juanca',
        name: 'Juan Carlos Bondi',
        followerCount: 0,
        followingCount: 0,
        PK: 'USER#juanca',
        SK: 'USER#juanca',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    });
    expect(params.ConditionExpression).toBeUndefined();
  });

  test('Create Photo', async () => {
    const params = await table.entities.Photo.put({
      username: 'juanca',
      url: 'https://photos.app.goo.gl/abcd1234',
    }).dbParams();

    expect(params).toMatchObject({
      TableName: 'InstagramClone',
      Item: expect.objectContaining({
        commentCount: 0,
        likesCount: 0,
        photoId: '01K16ZP43BRX67DG50SHGZ11DS',
        PK: 'UP#juanca',
        SK: 'PHOTO#01K16ZP43BRX67DG50SHGZ11DS',
        url: 'https://photos.app.goo.gl/abcd1234',
        username: 'juanca',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    });
  });

  test('Get Photo', async () => {
    const params = await table.entities.Photo.get({
      username: 'juanca',
      photoId: '01K16ZP43BRX67DG50SHGZ11DS',
    }).dbParams();

    expect(params).toEqual({
      Key: { PK: 'UP#juanca', SK: 'PHOTO#01K16ZP43BRX67DG50SHGZ11DS' },
      TableName: 'InstagramClone',
    });
  });

  test('Query user Photos - basic', async () => {
    const params = await table.entities.Photo.query()
      .where((attr, op) => op.eq(attr.username, 'juanca'))
      .dbParams();

    // After query builder fix: username -> pk, and value gets template applied
    expect(params).toEqual({
      TableName: 'InstagramClone',
      KeyConditionExpression: '#PK = :username_0',
      ExpressionAttributeNames: {
        '#PK': 'PK',
      },
      ExpressionAttributeValues: {
        ':username_0': 'UP#juanca', // Template applied: UP#${username}
      },
    });

    expect(params.TableName).toBe('InstagramClone');
    expect(params.KeyConditionExpression).toMatch(/#PK = :username_\d+/);
    expect(params.ExpressionAttributeNames).toEqual({
      '#PK': 'PK',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain('UP#juanca');
  });

  test('Query user Photos - with filter using AND', async () => {
    const params = await table.entities.Photo.query()
      .where((attr, op) => op.and(op.eq(attr.username, 'juanca'), op.gt(attr.likesCount, 0)))
      .dbParams();

    expect(params).toEqual({
      TableName: 'InstagramClone',
      KeyConditionExpression: '#PK = :username_0',
      FilterExpression: '#likesCount > :likesCount_1',
      ExpressionAttributeNames: {
        '#likesCount': 'likesCount',
        '#PK': 'PK',
      },
      ExpressionAttributeValues: {
        ':likesCount_1': 0,
        ':username_0': 'UP#juanca',
      },
    });

    expect(params.TableName).toBe('InstagramClone');
    expect(params.KeyConditionExpression).toMatch(/#PK = :username_\d+/);
    expect(params.FilterExpression).toMatch(/#likesCount > :likesCount_\d+/);
    expect(params.ExpressionAttributeNames).toEqual({
      '#PK': 'PK',
      '#likesCount': 'likesCount',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain('UP#juanca');
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(0);
  });

  test('Query user Photos - with limit and sort order', async () => {
    const params = await table.entities.Photo.query()
      .where((attr, op) => op.eq(attr.username, 'juanca'))
      .limit(10)
      .scanIndexForward(false)
      .dbParams();

    expect(params).toEqual({
      TableName: 'InstagramClone',
      KeyConditionExpression: '#PK = :username_0',
      ExpressionAttributeNames: {
        '#PK': 'PK',
      },
      ExpressionAttributeValues: {
        ':username_0': 'UP#juanca',
      },
      Limit: 10,
      ScanIndexForward: false,
    });

    expect(params.TableName).toBe('InstagramClone');
    expect(params.KeyConditionExpression).toMatch(/#PK = :username_\d+/);
    expect(params.Limit).toBe(10);
    expect(params.ScanIndexForward).toBe(false);
  });

  test('Query with projection', async () => {
    const params = await table.entities.Photo.query()
      .where((attr, op) => op.eq(attr.username, 'juanca'))
      .select(['photoId', 'url', 'likesCount'])
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.ProjectionExpression).toBe('photoId, url, likesCount');
  });

  test('Query Likes by photoId', async () => {
    const params = await table.entities.Like.query()
      .where((attr, op) => op.eq(attr.photoId, 'photo123'))
      .dbParams();

    expect(params).toEqual({
      TableName: 'InstagramClone',
      KeyConditionExpression: '#PK = :photoId_0',
      ExpressionAttributeNames: {
        '#PK': 'PK',
      },
      ExpressionAttributeValues: {
        ':photoId_0': 'PL#photo123', // Template applied: PL#${photoId}
      },
    });
    expect(params.TableName).toBe('InstagramClone');
    expect(params.KeyConditionExpression).toMatch(/#PK = :photoId_\d+/);
    expect(params.ExpressionAttributeNames).toEqual({ '#PK': 'PK' });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain('PL#photo123');
  });

  test('Query with OR filter expression', async () => {
    const params = await table.entities.Photo.query()
      .where((attr, op) =>
        op.and(
          op.eq(attr.username, 'juanca'),
          op.or(op.gt(attr.likesCount, 100), op.gt(attr.commentCount, 50))
        )
      )
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.KeyConditionExpression).toMatch(/#PK = :username_\d+/);
    expect(params.FilterExpression).toMatch(
      /\(#likesCount > :likesCount_\d+\) OR \(#commentCount > :commentCount_\d+\)/
    );
    expect(params.ExpressionAttributeNames).toEqual({
      '#PK': 'PK',
      '#likesCount': 'likesCount',
      '#commentCount': 'commentCount',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain('UP#juanca');
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(100);
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(50);
  });

  test('Query with complex nested conditions', async () => {
    const params = await table.entities.Photo.query()
      .where((attr, op) =>
        op.and(
          op.eq(attr.username, 'juanca'),
          op.or(
            op.and(op.gt(attr.likesCount, 100), op.lt(attr.commentCount, 10)),
            op.gt(attr.likesCount, 500)
          )
        )
      )
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.KeyConditionExpression).toMatch(/#PK = :username_\d+/);
    expect(params.FilterExpression).toMatch(
      /\(#likesCount > :likesCount_\d+\) AND \(#commentCount < :commentCount_\d+\)/
    );
    expect(params.FilterExpression).toMatch(/OR/);
    expect(params.ExpressionAttributeNames).toEqual({
      '#PK': 'PK',
      '#likesCount': 'likesCount',
      '#commentCount': 'commentCount',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain('UP#juanca');
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(100);
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(10);
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(500);
  });

  test('PUT with custom where condition using AND', async () => {
    const params = await table.entities.User.put({
      name: 'Juan Carlos Bondi',
      username: 'juanca',
      followerCount: 100,
    })
      .where((attr, op) => op.and(op.gt(attr.followerCount, 50), op.lt(attr.followerCount, 200)))
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Item).toMatchObject({
      username: 'juanca',
      name: 'Juan Carlos Bondi',
      followerCount: 100,
      followingCount: 0,
      PK: 'USER#juanca',
      SK: 'USER#juanca',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(params.ConditionExpression).toMatch(
      /\(#followerCount > :followerCount_\d+\) AND \(#followerCount < :followerCount_\d+\)/
    );
    expect(params.ExpressionAttributeNames).toEqual({
      '#followerCount': 'followerCount',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(50);
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(200);
  });

  test('PUT with OR condition', async () => {
    const params = await table.entities.Photo.put({
      username: 'juanca',
      url: 'https://example.com/photo.jpg',
    })
      .where((attr, op) => op.or(op.eq(attr.likesCount, 0), op.eq(attr.commentCount, 0)))
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.ConditionExpression).toMatch(
      /\(#likesCount = :likesCount_\d+\) OR \(#commentCount = :commentCount_\d+\)/
    );
    expect(params.ExpressionAttributeNames).toEqual({
      '#likesCount': 'likesCount',
      '#commentCount': 'commentCount',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(0);
  });

  test('PUT with ifNotExists and custom where condition', async () => {
    const params = await table.entities.User.put({
      name: 'Juan Carlos Bondi',
      username: 'juanca',
      followerCount: 100,
    })
      .ifNotExists()
      .where((attr, op) => op.gt(attr.followerCount, 50))
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    // Should have both ifNotExists conditions AND custom where condition
    expect(params.ConditionExpression).toMatch(/attribute_not_exists\(#PK\)/);
    expect(params.ConditionExpression).toMatch(/attribute_not_exists\(#SK\)/);
    expect(params.ConditionExpression).toMatch(/#followerCount > :followerCount_\d+/);
    expect(params.ConditionExpression).toMatch(/AND/);
    expect(params.ExpressionAttributeNames).toEqual({
      '#PK': 'PK',
      '#SK': 'SK',
      '#followerCount': 'followerCount',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(50);
  });

  // UPDATE tests
  test('UPDATE User followerCount - increment', async () => {
    const params = await table.entities.User.update({
      username: 'juanca',
    })
      .add('followerCount', 1)
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'USER#juanca',
      SK: 'USER#juanca',
    });
    expect(params.UpdateExpression).toContain('ADD #followerCount :followerCount_0');
    expect(params.UpdateExpression).toContain('SET #updatedAt = :updatedAt_ts');
    expect(params.ExpressionAttributeNames).toMatchObject({
      '#followerCount': 'followerCount',
      '#updatedAt': 'updatedAt',
    });
    expect(params.ExpressionAttributeValues).toMatchObject({
      ':followerCount_0': 1,
    });
  });

  test('UPDATE User - set name and increment followerCount', async () => {
    const params = await table.entities.User.update({
      username: 'juanca',
    })
      .set('name', 'Juan Carlos Bondi Updated')
      .add('followerCount', 5)
      .returning('ALL_NEW')
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'USER#juanca',
      SK: 'USER#juanca',
    });
    expect(params.UpdateExpression).toContain('SET #name = :name_0');
    expect(params.UpdateExpression).toContain('ADD #followerCount :followerCount_1');
    expect(params.UpdateExpression).toContain('#updatedAt = :updatedAt_ts');
    expect(params.ExpressionAttributeNames).toMatchObject({
      '#name': 'name',
      '#followerCount': 'followerCount',
      '#updatedAt': 'updatedAt',
    });
    expect(params.ExpressionAttributeValues).toMatchObject({
      ':name_0': 'Juan Carlos Bondi Updated',
      ':followerCount_1': 5,
    });
    expect(params.ReturnValues).toBe('ALL_NEW');
  });

  test('UPDATE Photo likesCount - increment with condition', async () => {
    const params = await table.entities.Photo.update({
      username: 'juanca',
      photoId: '01K16ZP43BRX67DG50SHGZ11DS',
    })
      .add('likesCount', 1)
      .where((attr, op) => op.gte(attr.commentCount, 0))
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'UP#juanca',
      SK: 'PHOTO#01K16ZP43BRX67DG50SHGZ11DS',
    });
    expect(params.UpdateExpression).toContain('ADD #likesCount :likesCount_0');
    expect(params.UpdateExpression).toContain('SET #updatedAt = :updatedAt_ts');
    expect(params.ConditionExpression).toMatch(/#commentCount >= :commentCount_\d+/);
    expect(params.ExpressionAttributeNames).toMatchObject({
      '#likesCount': 'likesCount',
      '#commentCount': 'commentCount',
      '#updatedAt': 'updatedAt',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(1);
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(0);
  });

  test('UPDATE Photo - increment both likes and comments', async () => {
    const params = await table.entities.Photo.update({
      username: 'juanca',
      photoId: '01K16ZP43BRX67DG50SHGZ11DS',
    })
      .add('likesCount', 1)
      .add('commentCount', 1)
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.UpdateExpression).toContain(
      'ADD #likesCount :likesCount_0, #commentCount :commentCount_1'
    );
    expect(params.UpdateExpression).toContain('SET #updatedAt = :updatedAt_ts');
    expect(params.ExpressionAttributeNames).toMatchObject({
      '#likesCount': 'likesCount',
      '#commentCount': 'commentCount',
      '#updatedAt': 'updatedAt',
    });
    expect(params.ExpressionAttributeValues).toMatchObject({
      ':likesCount_0': 1,
      ':commentCount_1': 1,
    });
  });

  test('UPDATE Comment - change content', async () => {
    const params = await table.entities.Comment.update({
      photoId: 'photo123',
      commentId: 'comment456',
    })
      .set('content', 'Updated comment text')
      .where((attr, op) => op.eq(attr.commentingUsername, 'juanca'))
      .returning('UPDATED_NEW')
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'PC#photo123',
      SK: 'COMMENT#comment456',
    });
    expect(params.UpdateExpression).toContain('SET #content = :content_0');
    expect(params.UpdateExpression).toContain('#updatedAt = :updatedAt_ts');
    expect(params.ConditionExpression).toMatch(/#commentingUsername = :commentingUsername_\d+/);
    expect(params.ReturnValues).toBe('UPDATED_NEW');
  });

  // DELETE tests
  test('DELETE User by username', async () => {
    const params = await table.entities.User.delete({
      username: 'juanca',
    }).dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'USER#juanca',
      SK: 'USER#juanca',
    });
    expect(params.ConditionExpression).toBeUndefined();
    expect(params.ReturnValues).toBeUndefined();
  });

  test('DELETE Photo with condition', async () => {
    const params = await table.entities.Photo.delete({
      username: 'juanca',
      photoId: '01K16ZP43BRX67DG50SHGZ11DS',
    })
      .where((attr, op) => op.eq(attr.likesCount, 0))
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'UP#juanca',
      SK: 'PHOTO#01K16ZP43BRX67DG50SHGZ11DS',
    });
    expect(params.ConditionExpression).toMatch(/#likesCount = :likesCount_\d+/);
    expect(params.ExpressionAttributeNames).toEqual({
      '#likesCount': 'likesCount',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(0);
  });

  test('DELETE Photo only if no likes or comments', async () => {
    const params = await table.entities.Photo.delete({
      username: 'juanca',
      photoId: '01K16ZP43BRX67DG50SHGZ11DS',
    })
      .where((attr, op) => op.and(op.eq(attr.likesCount, 0), op.eq(attr.commentCount, 0)))
      .returning('ALL_OLD')
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.ConditionExpression).toMatch(
      /\(#likesCount = :likesCount_\d+\) AND \(#commentCount = :commentCount_\d+\)/
    );
    expect(params.ExpressionAttributeNames).toEqual({
      '#likesCount': 'likesCount',
      '#commentCount': 'commentCount',
    });
    expect(params.ReturnValues).toBe('ALL_OLD');
  });

  test('DELETE Comment by photoId and commentId', async () => {
    const params = await table.entities.Comment.delete({
      photoId: 'photo123',
      commentId: 'comment456',
    }).dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'PC#photo123',
      SK: 'COMMENT#comment456',
    });
  });

  test('DELETE Like by photoId and likingUsername', async () => {
    const params = await table.entities.Like.delete({
      photoId: 'photo123',
      likingUsername: 'juanca',
    }).dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'PL#photo123',
      SK: 'LIKE#juanca',
    });
  });

  test('DELETE Follow relationship', async () => {
    const params = await table.entities.Follow.delete({
      followedUsername: 'alice',
      followingUsername: 'bob',
    }).dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.Key).toEqual({
      PK: 'FOLLOW#alice',
      SK: 'FOLLOW#bob',
    });
  });

  test('should fail when trying to update user without required username', async () => {
    expect(() => {
      table.entities.User.update({} as any);
    }).toThrow(
      '[User] Missing required key field(s) for update(): username. Required fields: username'
    );
  });

  test('should fail when trying to delete user without required username', async () => {
    expect(() => {
      table.entities.User.delete({} as any);
    }).toThrow(
      '[User] Missing required key field(s) for delete(): username. Required fields: username'
    );
  });

  // SCAN tests
  test('SCAN all Users', async () => {
    const params = await table.entities.User.scan().dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.FilterExpression).toBeUndefined();
  });

  test('SCAN Users with filter', async () => {
    const params = await table.entities.User.scan()
      .filter((attr, op) => op.gt(attr.followerCount, 100))
      .dbParams();

    expect(params.TableName).toBe('InstagramClone');
    expect(params.FilterExpression).toMatch(/#followerCount > :followerCount_\d+/);
    expect(params.ExpressionAttributeNames).toEqual({
      '#followerCount': 'followerCount',
    });
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(100);
  });

  test('SCAN Users with multiple filters', async () => {
    const params = await table.entities.User.scan()
      .filter((attr, op) => op.gt(attr.followerCount, 100))
      .filter((attr, op) => op.gt(attr.followingCount, 50))
      .dbParams();

    expect(params.FilterExpression).toMatch(
      /\(#followerCount > :followerCount_\d+\) AND \(#followingCount > :followingCount_\d+\)/
    );
    expect(params.ExpressionAttributeNames).toEqual({
      '#followerCount': 'followerCount',
      '#followingCount': 'followingCount',
    });
  });

  test('SCAN Photos with projection', async () => {
    const params = await table.entities.Photo.scan()
      .select(['username', 'photoId', 'likesCount'])
      .dbParams();

    expect(params.ProjectionExpression).toBe('username, photoId, likesCount');
  });

  test('SCAN Photos with limit', async () => {
    const params = await table.entities.Photo.scan()
      .filter((attr, op) => op.gt(attr.likesCount, 0))
      .limit(10)
      .dbParams();

    expect(params.Limit).toBe(10);
    expect(params.FilterExpression).toMatch(/#likesCount > :likesCount_\d+/);
  });

  test('SCAN with IN operator', async () => {
    const params = await table.entities.User.scan()
      .filter((attr, op) => op.in(attr.username, ['alice', 'bob', 'charlie']))
      .dbParams();

    expect(params.FilterExpression).toContain('IN');
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain('alice');
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain('bob');
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain('charlie');
  });

  test('SCAN with size operator', async () => {
    const params = await table.entities.User.scan()
      .filter((attr, op) => op.size(attr.name).gt(5))
      .dbParams();

    expect(params.FilterExpression).toMatch(/size\(#name\) > :name_size_\d+/);
    expect(Object.values(params.ExpressionAttributeValues || {})).toContain(5);
  });

  test('SCAN Comments with complex filter', async () => {
    const params = await table.entities.Comment.scan()
      .filter((attr, op) => op.and(op.exists(attr.content), op.size(attr.content).gt(10)))
      .select(['photoId', 'commentId', 'content'])
      .limit(50)
      .dbParams();

    expect(params.FilterExpression).toMatch(/attribute_exists\(#content\)/);
    expect(params.FilterExpression).toMatch(/size\(#content\) > :content_size_\d+/);
    expect(params.ProjectionExpression).toBe('photoId, commentId, content');
    expect(params.Limit).toBe(50);
  });

  // Entity-level BatchGet tests
  test('Entity BatchGet multiple Users', () => {
    const params = table.entities.User.batchGet([
      { username: 'alice' },
      { username: 'bob' },
      { username: 'charlie' },
    ]).dbParams();

    expect(params.RequestItems).toEqual({
      InstagramClone: {
        Keys: [
          { PK: 'USER#alice', SK: 'USER#alice' },
          { PK: 'USER#bob', SK: 'USER#bob' },
          { PK: 'USER#charlie', SK: 'USER#charlie' },
        ],
      },
    });
  });

  test('Entity BatchGet Users with projection', () => {
    const params = table.entities.User.batchGet([{ username: 'alice' }, { username: 'bob' }])
      .select(['username', 'name', 'followerCount'])
      .dbParams();

    expect(params.RequestItems).toEqual({
      InstagramClone: {
        Keys: [
          { PK: 'USER#alice', SK: 'USER#alice' },
          { PK: 'USER#bob', SK: 'USER#bob' },
        ],
        ProjectionExpression: 'username, name, followerCount',
      },
    });
  });

  test('Entity BatchGet Photos', () => {
    const params = table.entities.Photo.batchGet([
      { username: 'alice', photoId: 'photo1' },
      { username: 'alice', photoId: 'photo2' },
      { username: 'bob', photoId: 'photo3' },
    ]).dbParams();

    expect(params.RequestItems).toEqual({
      InstagramClone: {
        Keys: [
          { PK: 'UP#alice', SK: 'PHOTO#photo1' },
          { PK: 'UP#alice', SK: 'PHOTO#photo2' },
          { PK: 'UP#bob', SK: 'PHOTO#photo3' },
        ],
      },
    });
  });

  test('Entity BatchGet should fail with missing key fields', () => {
    expect(() => {
      table.entities.Photo.batchGet([
        // @ts-expect-error - Missing photoId to test error handling
        { username: 'alice' },
      ]);
    }).toThrow(
      '[Photo] Missing required key field(s) for batchGet(): photoId. Required fields: username, photoId'
    );
  });

  // Entity-level BatchWrite tests
  test('Entity BatchWrite create multiple Users', () => {
    const params = table.entities.User.batchWrite([
      {
        username: 'alice',
        name: 'Alice Smith',
        followerCount: 100,
        followingCount: 50,
      },
      {
        username: 'bob',
        name: 'Bob Jones',
        followerCount: 200,
        followingCount: 75,
      },
    ]).dbParams();

    expect(params.RequestItems?.InstagramClone).toHaveLength(2);
    expect(params.RequestItems?.InstagramClone[0]?.PutRequest?.Item).toMatchObject({
      PK: 'USER#alice',
      SK: 'USER#alice',
      username: 'alice',
      name: 'Alice Smith',
      followerCount: 100,
      followingCount: 50,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(params.RequestItems?.InstagramClone[1]?.PutRequest?.Item).toMatchObject({
      PK: 'USER#bob',
      SK: 'USER#bob',
      username: 'bob',
      name: 'Bob Jones',
      followerCount: 200,
      followingCount: 75,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  test('Entity BatchWrite create multiple Photos', () => {
    const params = table.entities.Photo.batchWrite([
      {
        username: 'alice',
        url: 'https://example.com/photo1.jpg',
      },
      {
        username: 'alice',
        url: 'https://example.com/photo2.jpg',
      },
    ]).dbParams();

    expect(params.RequestItems).toBeDefined();
    if (params.RequestItems?.InstagramClone) {
      expect(params.RequestItems.InstagramClone).toHaveLength(2);
      expect(params.RequestItems.InstagramClone[0]?.PutRequest?.Item).toMatchObject({
        username: 'alice',
        url: 'https://example.com/photo1.jpg',
        photoId: '01K16ZP43BRX67DG50SHGZ11DS',
        likesCount: 0,
        commentCount: 0,
        PK: 'UP#alice',
        SK: 'PHOTO#01K16ZP43BRX67DG50SHGZ11DS',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    }
  });

  test('Entity BatchWrite with defaults applied', () => {
    const params = table.entities.User.batchWrite([
      {
        username: 'charlie',
        name: 'Charlie Brown',
      },
    ]).dbParams();

    expect(params.RequestItems).toBeDefined();
    if (params.RequestItems?.InstagramClone) {
      expect(params.RequestItems.InstagramClone[0]?.PutRequest?.Item).toMatchObject({
        username: 'charlie',
        name: 'Charlie Brown',
        followerCount: 0,
        followingCount: 0,
        PK: 'USER#charlie',
        SK: 'USER#charlie',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    }
  });
});
