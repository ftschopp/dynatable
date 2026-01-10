import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createTransactWriteBuilder } from './create-transact-write-builder';

const client = new DynamoDBClient({});

describe('TransactWrite Builder - Functional API', () => {
  test('should create empty transaction', () => {
    const params = createTransactWriteBuilder(client).dbParams();

    expect(params).toEqual({
      TransactItems: [],
    });
  });

  test('should add single Put operation', () => {
    const putParams = {
      TableName: 'InstagramClone',
      Item: {
        pk: 'USER#alice',
        sk: 'USER#alice',
        username: 'alice',
        name: 'Alice Smith',
        followerCount: 0,
        followingCount: 0,
      },
    };

    const params = createTransactWriteBuilder(client).addPut(putParams).dbParams();

    expect(params).toEqual({
      TransactItems: [{ Put: putParams }],
    });
  });

  test('should add single Update operation', () => {
    const updateParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#alice', sk: 'USER#alice' },
      UpdateExpression: 'ADD #followerCount :followerCount_0',
      ExpressionAttributeNames: { '#followerCount': 'followerCount' },
      ExpressionAttributeValues: { ':followerCount_0': 1 },
    };

    const params = createTransactWriteBuilder(client).addUpdate(updateParams).dbParams();

    expect(params).toEqual({
      TransactItems: [{ Update: updateParams }],
    });
  });

  test('should add single Delete operation', () => {
    const deleteParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#alice', sk: 'USER#alice' },
    };

    const params = createTransactWriteBuilder(client).addDelete(deleteParams).dbParams();

    expect(params).toEqual({
      TransactItems: [{ Delete: deleteParams }],
    });
  });

  test('should add ConditionCheck operation', () => {
    const conditionCheckParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#admin', sk: 'USER#admin' },
      ConditionExpression: 'attribute_exists(#username)',
      ExpressionAttributeNames: { '#username': 'username' },
    };

    const params = createTransactWriteBuilder(client)
      .addConditionCheck(conditionCheckParams)
      .dbParams();

    expect(params).toEqual({
      TransactItems: [{ ConditionCheck: conditionCheckParams }],
    });
  });

  test('should chain multiple operations - Like a Photo', () => {
    // Like a Photo: Create Like + Increment Photo.likesCount
    const putLikeParams = {
      TableName: 'InstagramClone',
      Item: {
        pk: 'PL#photo123',
        sk: 'LIKE#juanca',
        photoId: 'photo123',
        likingUsername: 'juanca',
        likeId: '01K16ZP43BRX67DG50SHGZ11DS',
      },
      ConditionExpression: '(attribute_not_exists(#PK)) AND (attribute_not_exists(#SK))',
      ExpressionAttributeNames: { '#PK': 'pk', '#SK': 'sk' },
    };

    const updatePhotoParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'UP#alice', sk: 'PHOTO#photo123' },
      UpdateExpression: 'ADD #likesCount :likesCount_0',
      ExpressionAttributeNames: { '#likesCount': 'likesCount' },
      ExpressionAttributeValues: { ':likesCount_0': 1 },
    };

    const params = createTransactWriteBuilder(client)
      .addPut(putLikeParams)
      .addUpdate(updatePhotoParams)
      .dbParams();

    expect(params).toEqual({
      TransactItems: [{ Put: putLikeParams }, { Update: updatePhotoParams }],
    });
    expect(params.TransactItems).toHaveLength(2);
  });

  test('should chain multiple operations - Follow a User', () => {
    // Follow: Create Follow + Update both user counts
    const putFollowParams = {
      TableName: 'InstagramClone',
      Item: {
        pk: 'FOLLOW#alice',
        sk: 'FOLLOW#bob',
        followedUsername: 'alice',
        followingUsername: 'bob',
      },
      ConditionExpression: '(attribute_not_exists(#PK)) AND (attribute_not_exists(#SK))',
      ExpressionAttributeNames: { '#PK': 'pk', '#SK': 'sk' },
    };

    const updateFollowedParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#alice', sk: 'USER#alice' },
      UpdateExpression: 'ADD #followerCount :followerCount_0',
      ExpressionAttributeNames: { '#followerCount': 'followerCount' },
      ExpressionAttributeValues: { ':followerCount_0': 1 },
    };

    const updateFollowingParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#bob', sk: 'USER#bob' },
      UpdateExpression: 'ADD #followingCount :followingCount_0',
      ExpressionAttributeNames: { '#followingCount': 'followingCount' },
      ExpressionAttributeValues: { ':followingCount_0': 1 },
    };

    const params = createTransactWriteBuilder(client)
      .addPut(putFollowParams)
      .addUpdate(updateFollowedParams)
      .addUpdate(updateFollowingParams)
      .dbParams();

    expect(params.TransactItems).toHaveLength(3);
    expect(params.TransactItems[0]).toEqual({ Put: putFollowParams });
    expect(params.TransactItems[1]).toEqual({ Update: updateFollowedParams });
    expect(params.TransactItems[2]).toEqual({ Update: updateFollowingParams });
  });

  test('should chain multiple operations - Comment on Photo', () => {
    const putCommentParams = {
      TableName: 'InstagramClone',
      Item: {
        pk: 'PC#photo123',
        sk: 'COMMENT#comment456',
        photoId: 'photo123',
        commentId: 'comment456',
        commentingUsername: 'bob',
        content: 'Great photo!',
      },
    };

    const updatePhotoParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'UP#alice', sk: 'PHOTO#photo123' },
      UpdateExpression: 'ADD #commentCount :commentCount_0',
      ExpressionAttributeNames: { '#commentCount': 'commentCount' },
      ExpressionAttributeValues: { ':commentCount_0': 1 },
    };

    const params = createTransactWriteBuilder(client)
      .addPut(putCommentParams)
      .addUpdate(updatePhotoParams)
      .dbParams();

    expect(params.TransactItems).toHaveLength(2);
    expect(params.TransactItems[0]).toEqual({ Put: putCommentParams });
    expect(params.TransactItems[1]).toEqual({ Update: updatePhotoParams });
  });

  test('should support client request token for idempotency', () => {
    const putParams = {
      TableName: 'InstagramClone',
      Item: { pk: 'USER#alice', sk: 'USER#alice', username: 'alice' },
    };

    const params = createTransactWriteBuilder(client)
      .addPut(putParams)
      .withClientRequestToken('my-unique-token-123')
      .dbParams();

    expect(params).toEqual({
      TransactItems: [{ Put: putParams }],
      ClientRequestToken: 'my-unique-token-123',
    });
  });

  test('should preserve immutability - original builder unchanged', () => {
    const builder1 = createTransactWriteBuilder(client);
    const putParams = {
      TableName: 'InstagramClone',
      Item: { pk: 'USER#alice', sk: 'USER#alice' },
    };

    const builder2 = builder1.addPut(putParams);
    const builder3 = builder2.withClientRequestToken('token');

    // Each builder should be independent
    expect(builder1.dbParams().TransactItems).toHaveLength(0);
    expect(builder2.dbParams().TransactItems).toHaveLength(1);
    expect(builder3.dbParams().ClientRequestToken).toBe('token');
    expect(builder2.dbParams().ClientRequestToken).toBeUndefined();
  });

  test('should handle complex transaction - Delete Photo only if no engagement', () => {
    const deletePhotoParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'UP#alice', sk: 'PHOTO#photo123' },
      ConditionExpression: '(#likesCount = :likesCount_0) AND (#commentCount = :commentCount_1)',
      ExpressionAttributeNames: {
        '#likesCount': 'likesCount',
        '#commentCount': 'commentCount',
      },
      ExpressionAttributeValues: {
        ':likesCount_0': 0,
        ':commentCount_1': 0,
      },
    };

    const params = createTransactWriteBuilder(client).addDelete(deletePhotoParams).dbParams();

    expect(params.TransactItems).toHaveLength(1);
    expect(params.TransactItems[0]).toEqual({ Delete: deletePhotoParams });
  });

  test('should handle max operations (100 items limit)', () => {
    let builder = createTransactWriteBuilder(client);

    // Add 100 Put operations (DynamoDB limit)
    for (let i = 0; i < 100; i++) {
      builder = builder.addPut({
        TableName: 'InstagramClone',
        Item: { pk: `USER#user${i}`, sk: `USER#user${i}` },
      });
    }

    const params = builder.dbParams();
    expect(params.TransactItems).toHaveLength(100);
  });

  test('should mix all operation types', () => {
    const params = createTransactWriteBuilder(client)
      .addPut({
        TableName: 'InstagramClone',
        Item: { pk: 'USER#alice', sk: 'USER#alice' },
      })
      .addUpdate({
        TableName: 'InstagramClone',
        Key: { pk: 'USER#bob', sk: 'USER#bob' },
        UpdateExpression: 'ADD #count :val',
        ExpressionAttributeNames: { '#count': 'followerCount' },
        ExpressionAttributeValues: { ':val': 1 },
      })
      .addDelete({
        TableName: 'InstagramClone',
        Key: { pk: 'PHOTO#old', sk: 'PHOTO#old' },
      })
      .addConditionCheck({
        TableName: 'InstagramClone',
        Key: { pk: 'USER#admin', sk: 'USER#admin' },
        ConditionExpression: 'attribute_exists(pk)',
      })
      .dbParams();

    expect(params.TransactItems).toHaveLength(4);
    expect(params.TransactItems[0]).toHaveProperty('Put');
    expect(params.TransactItems[1]).toHaveProperty('Update');
    expect(params.TransactItems[2]).toHaveProperty('Delete');
    expect(params.TransactItems[3]).toHaveProperty('ConditionCheck');
  });
});
