import { Migration } from '@ftschopp/dynatable-migrations';

/**
 * Migration: add_user_email
 * Version: 0.2.0
 *
 * Adds email and emailVerified fields to all User entities.
 * This simulates adding a new required field to existing data.
 */
export const migration: Migration = {
  version: '0.2.0',
  name: 'add_user_email',
  description: 'Add email and emailVerified fields to User entities',

  schema: {
    User: {
      newAttributes: ['email', 'emailVerified'],
    },
  },

  async up({ client, tableName, dynamodb }) {
    console.log('[0.2.0] Adding email fields to users...');

    const { ScanCommand, UpdateCommand } = dynamodb;

    // Find all users
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk) AND entityType = :type',
        ExpressionAttributeValues: {
          ':pk': 'USER#',
          ':type': 'User',
        },
      })
    );

    const users = result.Items || [];
    console.log(`[0.2.0] Found ${users.length} users to update`);

    for (const user of users) {
      // Generate email from username
      const email = `${user.username}@example.com`;

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: 'SET email = :email, emailVerified = :verified',
          ExpressionAttributeValues: {
            ':email': email,
            ':verified': false,
          },
        })
      );

      console.log(`[0.2.0] Updated user: ${user.username} -> ${email}`);
    }

    console.log(`[0.2.0] Successfully added email to ${users.length} users`);
  },

  async down({ client, tableName, dynamodb }) {
    console.log('[0.2.0] Removing email fields from users...');

    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk) AND entityType = :type',
        ExpressionAttributeValues: {
          ':pk': 'USER#',
          ':type': 'User',
        },
      })
    );

    const users = result.Items || [];

    for (const user of users) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: 'REMOVE email, emailVerified',
        })
      );

      console.log(`[0.2.0] Removed email from: ${user.username}`);
    }

    console.log(`[0.2.0] Successfully removed email from ${users.length} users`);
  },
};
