import { ExecutableBuilder } from '../shared';

/**
 * Builder for DynamoDB GetItem operations.
 * Supports projection, consistent read, and inspection of the final parameters.
 */
export interface GetBuilder<KeyInput, Model> extends ExecutableBuilder<Model | undefined> {
  /**
   * Adds a projection expression to only return specific attributes.
   * Returns a new immutable builder.
   */
  select(attrs: (keyof Model)[]): GetBuilder<KeyInput, Model>;

  /**
   * Enables strongly consistent read (eventual consistency is default).
   * Returns a new immutable builder.
   */
  consistentRead(): GetBuilder<KeyInput, Model>;

  /**
   * Configures the ReturnConsumedCapacity parameter.
   * Returns a new immutable builder.
   *
   * @param mode - 'INDEXES' | 'TOTAL' | 'NONE'
   * - INDEXES: Returns consumed capacity for table and indexes
   * - TOTAL: Returns total consumed capacity
   * - NONE: No consumed capacity data returned (default)
   */
  returnConsumedCapacity(mode: 'INDEXES' | 'TOTAL' | 'NONE'): GetBuilder<KeyInput, Model>;
}
