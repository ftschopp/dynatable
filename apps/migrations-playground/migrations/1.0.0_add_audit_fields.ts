import { Migration } from '@ftschopp/dynatable-migrations';

/**
 * Migration: add_audit_fields
 * Version: 1.0.0 (MAJOR)
 *
 * Adds audit fields (updatedAt, version) to ALL entities.
 * This is a major version because it affects all entity types.
 */
export const migration: Migration = {
  version: '1.0.0',
  name: 'add_audit_fields',
  description: 'Add updatedAt and version fields to all entities for auditing',

  schema: {
    _all: {
      newAttributes: ['updatedAt', '_version'],
    },
  },

  async up({ client, tableName, dynamodb }) {
    console.log('[1.0.0] Adding audit fields to all entities...');

    const { ScanCommand, UpdateCommand } = dynamodb;

    // Scan all items (except migration tracking records)
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'NOT begins_with(PK, :schema)',
        ExpressionAttributeValues: {
          ':schema': '_SCHEMA#',
        },
      })
    );

    const items = result.Items || [];
    console.log(`[1.0.0] Found ${items.length} items to update`);

    const now = new Date().toISOString();
    let updated = 0;

    for (const item of items) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: 'SET updatedAt = :updatedAt, #version = :version',
          ExpressionAttributeNames: {
            '#version': '_version',
          },
          ExpressionAttributeValues: {
            ':updatedAt': now,
            ':version': 1,
          },
        })
      );

      updated++;
      if (updated % 5 === 0) {
        console.log(`[1.0.0] Progress: ${updated}/${items.length}`);
      }
    }

    console.log(`[1.0.0] Successfully added audit fields to ${updated} items`);
  },

  async down({ client, tableName, dynamodb }) {
    console.log('[1.0.0] Removing audit fields from all entities...');

    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'NOT begins_with(PK, :schema)',
        ExpressionAttributeValues: {
          ':schema': '_SCHEMA#',
        },
      })
    );

    const items = result.Items || [];
    let updated = 0;

    for (const item of items) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: 'REMOVE updatedAt, #version',
          ExpressionAttributeNames: {
            '#version': '_version',
          },
        })
      );

      updated++;
    }

    console.log(`[1.0.0] Successfully removed audit fields from ${updated} items`);
  },
};
