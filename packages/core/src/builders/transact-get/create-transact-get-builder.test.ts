import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createTransactGetBuilder } from './create-transact-get-builder';

const client = new DynamoDBClient({});

describe('TransactGet Builder - Functional API', () => {
  test('should create empty transaction', () => {
    const params = createTransactGetBuilder(client).dbParams();

    expect(params).toEqual({
      TransactItems: [],
    });
  });

  test('should add single Get operation', () => {
    const getParams = {
      TableName: 'InstagramClone',
      Key: {
        pk: 'USER#alice',
        sk: 'USER#alice',
      },
    };

    const params = createTransactGetBuilder(client).addGet(getParams).dbParams();

    expect(params).toEqual({
      TransactItems: [{ Get: getParams }],
    });
  });

  test('should chain multiple Get operations', () => {
    const getUserParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#alice', sk: 'USER#alice' },
    };

    const getPhotoParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'UP#alice', sk: 'PHOTO#photo123' },
    };

    const params = createTransactGetBuilder(client)
      .addGet(getUserParams)
      .addGet(getPhotoParams)
      .dbParams();

    expect(params).toEqual({
      TransactItems: [{ Get: getUserParams }, { Get: getPhotoParams }],
    });
    expect(params.TransactItems).toHaveLength(2);
  });

  test('should get User + Photo + Comment atomically', () => {
    const getUserParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#alice', sk: 'USER#alice' },
    };

    const getPhotoParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'UP#alice', sk: 'PHOTO#photo123' },
    };

    const getCommentParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'PC#photo123', sk: 'COMMENT#comment456' },
    };

    const params = createTransactGetBuilder(client)
      .addGet(getUserParams)
      .addGet(getPhotoParams)
      .addGet(getCommentParams)
      .dbParams();

    expect(params.TransactItems).toHaveLength(3);
    expect(params.TransactItems[0]).toEqual({ Get: getUserParams });
    expect(params.TransactItems[1]).toEqual({ Get: getPhotoParams });
    expect(params.TransactItems[2]).toEqual({ Get: getCommentParams });
  });

  test('should support projection expressions', () => {
    const getParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#alice', sk: 'USER#alice' },
      ProjectionExpression: 'username, name, followerCount',
      ExpressionAttributeNames: {
        '#username': 'username',
        '#name': 'name',
        '#followerCount': 'followerCount',
      },
    };

    const params = createTransactGetBuilder(client).addGet(getParams).dbParams();

    expect(params.TransactItems[0]?.Get).toEqual(getParams);
    expect(params.TransactItems[0]?.Get.ProjectionExpression).toBe('username, name, followerCount');
  });

  test('should get Follow relationship + both Users', () => {
    const getFollowParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'FOLLOW#alice', sk: 'FOLLOW#bob' },
    };

    const getFollowerParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#bob', sk: 'USER#bob' },
    };

    const getFollowedParams = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#alice', sk: 'USER#alice' },
    };

    const params = createTransactGetBuilder(client)
      .addGet(getFollowParams)
      .addGet(getFollowerParams)
      .addGet(getFollowedParams)
      .dbParams();

    expect(params.TransactItems).toHaveLength(3);
  });

  test('should preserve immutability - original builder unchanged', () => {
    const builder1 = createTransactGetBuilder(client);
    const getParams1 = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#alice', sk: 'USER#alice' },
    };
    const getParams2 = {
      TableName: 'InstagramClone',
      Key: { pk: 'USER#bob', sk: 'USER#bob' },
    };

    const builder2 = builder1.addGet(getParams1);
    const builder3 = builder2.addGet(getParams2);

    // Each builder should be independent
    expect(builder1.dbParams().TransactItems).toHaveLength(0);
    expect(builder2.dbParams().TransactItems).toHaveLength(1);
    expect(builder3.dbParams().TransactItems).toHaveLength(2);
  });

  test('should handle max operations (25 items limit)', () => {
    let builder = createTransactGetBuilder(client);

    // Add 25 Get operations (DynamoDB limit for TransactGet)
    for (let i = 0; i < 25; i++) {
      builder = builder.addGet({
        TableName: 'InstagramClone',
        Key: { pk: `USER#user${i}`, sk: `USER#user${i}` },
      });
    }

    const params = builder.dbParams();
    expect((params.TransactItems as any).length).toBe(25);
  });

  test('should get multiple Likes for a Photo', () => {
    const params = createTransactGetBuilder(client)
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'PL#photo123', sk: 'LIKE#alice' },
      })
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'PL#photo123', sk: 'LIKE#bob' },
      })
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'PL#photo123', sk: 'LIKE#charlie' },
      })
      .dbParams();

    expect(params.TransactItems).toHaveLength(3);
    expect(params.TransactItems.every((item: any) => item.Get.Key.pk === 'PL#photo123')).toBe(true);
  });

  test('should get Photo + its Comments', () => {
    const params = createTransactGetBuilder(client)
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'UP#alice', sk: 'PHOTO#photo123' },
      })
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'PC#photo123', sk: 'COMMENT#comment1' },
      })
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'PC#photo123', sk: 'COMMENT#comment2' },
      })
      .dbParams();

    expect(params.TransactItems).toHaveLength(3);
  });

  test('should build complex cross-entity read', () => {
    // Get User + their Photo + Like on that photo + Comment on that photo
    const params = createTransactGetBuilder(client)
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'USER#alice', sk: 'USER#alice' },
      })
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'UP#alice', sk: 'PHOTO#photo123' },
      })
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'PL#photo123', sk: 'LIKE#bob' },
      })
      .addGet({
        TableName: 'InstagramClone',
        Key: { pk: 'PC#photo123', sk: 'COMMENT#comment456' },
      })
      .dbParams();

    expect(params.TransactItems).toHaveLength(4);

    // Verify each entity type
    expect(params.TransactItems[0]?.Get.Key).toEqual({
      pk: 'USER#alice',
      sk: 'USER#alice',
    });
    expect(params.TransactItems[1]?.Get.Key).toEqual({
      pk: 'UP#alice',
      sk: 'PHOTO#photo123',
    });
    expect(params.TransactItems[2]?.Get.Key).toEqual({
      pk: 'PL#photo123',
      sk: 'LIKE#bob',
    });
    expect(params.TransactItems[3]?.Get.Key).toEqual({
      pk: 'PC#photo123',
      sk: 'COMMENT#comment456',
    });
  });
});
