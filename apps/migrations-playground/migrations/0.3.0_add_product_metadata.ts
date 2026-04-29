import { Migration } from '@ftschopp/dynatable-migrations';

/**
 * Migration: add_product_metadata
 * Version: 0.3.0
 *
 * Adds metadata fields to products: sku, weight, dimensions.
 * Also calculates and adds a 'lowStock' boolean field.
 */
export const migration: Migration = {
  version: '0.3.0',
  name: 'add_product_metadata',
  description: 'Add SKU, weight, dimensions, and lowStock flag to products',

  schema: {
    Product: {
      newAttributes: ['sku', 'weight', 'dimensions', 'lowStock'],
    },
  },

  async up({ client, tableName, dynamodb }) {
    console.log('[0.3.0] Adding metadata to products...');

    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk) AND entityType = :type',
        ExpressionAttributeValues: {
          ':pk': 'PRODUCT#',
          ':type': 'Product',
        },
      })
    );

    const products = result.Items || [];
    console.log(`[0.3.0] Found ${products.length} products to update`);

    for (const product of products) {
      // Generate SKU from productId
      const sku = `SKU-${product.productId.replace('prod-', '').toUpperCase()}`;

      // Determine if low stock (less than 100)
      const lowStock = (product.stock || 0) < 100;

      // Add some sample weight and dimensions
      const weight = Math.round(Math.random() * 1000) / 100; // 0.00 to 10.00 kg
      const dimensions = {
        length: Math.round(Math.random() * 50) + 5,
        width: Math.round(Math.random() * 30) + 5,
        height: Math.round(Math.random() * 20) + 2,
        unit: 'cm',
      };

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: product.PK, SK: product.SK },
          UpdateExpression:
            'SET sku = :sku, weight = :weight, dimensions = :dimensions, lowStock = :lowStock',
          ExpressionAttributeValues: {
            ':sku': sku,
            ':weight': weight,
            ':dimensions': dimensions,
            ':lowStock': lowStock,
          },
        })
      );

      console.log(`[0.3.0] Updated product: ${product.name} (SKU: ${sku}, lowStock: ${lowStock})`);
    }

    console.log(`[0.3.0] Successfully updated ${products.length} products`);
  },

  async down({ client, tableName, dynamodb }) {
    console.log('[0.3.0] Removing metadata from products...');

    const { ScanCommand, UpdateCommand } = dynamodb;

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK, :pk) AND entityType = :type',
        ExpressionAttributeValues: {
          ':pk': 'PRODUCT#',
          ':type': 'Product',
        },
      })
    );

    const products = result.Items || [];

    for (const product of products) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: product.PK, SK: product.SK },
          UpdateExpression: 'REMOVE sku, weight, dimensions, lowStock',
        })
      );

      console.log(`[0.3.0] Removed metadata from: ${product.name}`);
    }

    console.log(`[0.3.0] Successfully cleaned ${products.length} products`);
  },
};
