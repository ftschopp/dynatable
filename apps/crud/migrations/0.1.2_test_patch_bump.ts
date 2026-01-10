import { Migration } from '@ftschopp/dynatable-migrations';

/**
 * Migration: test_patch_bump
 * Version: 0.1.2
 *
 * Description:
 * Add description of what this migration does here.
 *
 * Version type:
 * - MAJOR (X.0.0): Breaking changes, incompatible schema changes
 * - MINOR (0.X.0): New features, backwards-compatible changes
 * - PATCH (0.0.X): Bug fixes, data corrections
 */
export const migration: Migration = {
  version: '0.1.2',
  name: 'test_patch_bump',
  description: 'Add description here',

  /**
   * Schema snapshot (optional)
   * Document your schema changes here for reference
   */
  schema: {
    // Example:
    // User: {
    //   attributes: {
    //     username: { type: String, required: true },
    //     email: { type: String, required: false },
    //   }
    // }
  },

  /**
   * Apply migration
   */
  async up({ client, tableName, dynamodb }) {
    console.log('Running migration: test_patch_bump');

    // Example: Add a new attribute to existing items
    // const { ScanCommand, UpdateCommand } = dynamodb;
    //
    // const result = await client.send(new ScanCommand({
    //   TableName: tableName,
    //   FilterExpression: "begins_with(PK, :pk)",
    //   ExpressionAttributeValues: { ":pk": "USER#" }
    // }));
    //
    // for (const item of result.Items || []) {
    //   await client.send(new UpdateCommand({
    //     TableName: tableName,
    //     Key: { PK: item.PK, SK: item.SK },
    //     UpdateExpression: "SET emailVerified = :value",
    //     ExpressionAttributeValues: { ":value": false }
    //   }));
    // }

    console.log('✅ Migration completed');
  },

  /**
   * Rollback migration
   */
  async down({ client, tableName, dynamodb }) {
    console.log('Rolling back migration: test_patch_bump');

    // Example: Remove the attribute added in up()
    // const { ScanCommand, UpdateCommand } = dynamodb;
    //
    // const result = await client.send(new ScanCommand({
    //   TableName: tableName,
    //   FilterExpression: "begins_with(PK, :pk)",
    //   ExpressionAttributeValues: { ":pk": "USER#" }
    // }));
    //
    // for (const item of result.Items || []) {
    //   await client.send(new UpdateCommand({
    //     TableName: tableName,
    //     Key: { PK: item.PK, SK: item.SK },
    //     UpdateExpression: "REMOVE email, emailVerified"
    //   }));
    // }

    console.log('✅ Rollback completed');
  },
};
