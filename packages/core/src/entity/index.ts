/**
 * Entity API module
 *
 * Provides high-level entity management with validation, key resolution, and builder creation.
 */

// Core types
export type { EntityAPI, EntityAPIOptions } from './types';

// Middleware types and utilities
export type { ExecutionMiddleware } from './middleware/types';
export { withMiddleware } from './middleware/with-middleware';
export { createCleanKeysMiddleware } from './middleware/factories';

// Validation utilities
export { validateKeyFields } from './validation/key-validation';

// Main entity API factory
export { createEntityAPI } from './create-entity-api';
