import { Migration } from '@ftschopp/dynatable-migrations';

/**
 * Migration: initial_setup
 * Version: 0.1.0
 *
 * This is the initial migration that documents the base schema.
 * It doesn't make any data changes, just establishes the baseline.
 */
export const migration: Migration = {
  version: '0.1.0',
  name: 'initial_setup',
  description: 'Initial schema setup - establishes baseline',

  schema: {
    User: {
      PK: 'USER#${username}',
      SK: 'USER#${username}',
      attributes: ['username', 'name', 'createdAt'],
    },
    Product: {
      PK: 'PRODUCT#${productId}',
      SK: 'PRODUCT#${productId}',
      attributes: ['productId', 'name', 'price', 'category', 'stock'],
    },
    Order: {
      PK: 'USER#${username}',
      SK: 'ORDER#${orderId}',
      attributes: ['orderId', 'username', 'total', 'status', 'items'],
    },
  },

  async up({ tableName }) {
    console.log(`[0.1.0] Initial setup for table: ${tableName}`);
    console.log('[0.1.0] Base schema documented');
    console.log('[0.1.0] No data changes required');
  },

  async down() {
    console.log('[0.1.0] Rolling back initial setup');
    console.log('[0.1.0] Nothing to rollback');
  },
};
