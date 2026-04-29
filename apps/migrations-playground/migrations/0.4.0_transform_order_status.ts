import { Migration } from '@ftschopp/dynatable-migrations';

/**
 * Migration: transform_order_status
 * Version: 0.4.0
 *
 * Transforms order status from simple string to structured status object.
 * Before: status: "completed"
 * After:  statusInfo: { code: "completed", updatedAt: "...", history: [...] }
 */
export const migration: Migration = {
  version: '0.4.0',
  name: 'transform_order_status',
  description: 'Transform order status to structured statusInfo object',

  schema: {
    Order: {
      removedAttributes: ['status'],
      newAttributes: ['statusInfo'],
    },
  },

  async up({ client, tableName, dynamodb }) {
    console.log('[0.4.0] Transforming order status to statusInfo...');

    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'entityType = :type',
        ExpressionAttributeValues: {
          ':type': 'Order',
        },
      })
    );

    const orders = result.Items || [];
    console.log(`[0.4.0] Found ${orders.length} orders to transform`);

    for (const order of orders) {
      const oldStatus = order.status || 'unknown';
      const now = new Date().toISOString();

      // Create structured status info
      const statusInfo = {
        code: oldStatus,
        updatedAt: now,
        history: [
          {
            status: oldStatus,
            timestamp: order.createdAt || now,
            note: 'Migrated from legacy status field',
          },
        ],
      };

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: order.PK, SK: order.SK },
          UpdateExpression: 'SET statusInfo = :info REMOVE #status',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':info': statusInfo,
          },
        })
      );

      console.log(`[0.4.0] Transformed order ${order.orderId}: "${oldStatus}" -> statusInfo`);
    }

    console.log(`[0.4.0] Successfully transformed ${orders.length} orders`);
  },

  async down({ client, tableName, dynamodb }) {
    console.log('[0.4.0] Reverting statusInfo back to status...');

    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'entityType = :type',
        ExpressionAttributeValues: {
          ':type': 'Order',
        },
      })
    );

    const orders = result.Items || [];

    for (const order of orders) {
      const statusCode = order.statusInfo?.code || 'unknown';

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: order.PK, SK: order.SK },
          UpdateExpression: 'SET #status = :status REMOVE statusInfo',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': statusCode,
          },
        })
      );

      console.log(`[0.4.0] Reverted order ${order.orderId}: statusInfo -> "${statusCode}"`);
    }

    console.log(`[0.4.0] Successfully reverted ${orders.length} orders`);
  },
};
