import type { PutCommandInput } from '@aws-sdk/lib-dynamodb';
import { OperationBuilder } from '../shared';

/**
 * Builder interface for DynamoDB PutItem operations
 */
export interface PutBuilder<Model> extends Omit<OperationBuilder<Model>, 'dbParams'> {
  /**
   * Adds a condition that the item must not exist (checks pk and sk)
   */
  ifNotExists(): PutBuilder<Model>;

  /**
   * Configures what values should be returned after the put operation.
   * - NONE: Nothing is returned (default)
   * - ALL_OLD: Returns the item as it was before being replaced (if it existed)
   */
  returning(mode: 'NONE' | 'ALL_OLD'): PutBuilder<Model>;

  /**
   * Converts the builder state to DynamoDB PutItem parameters
   */
  dbParams(): PutCommandInput;
}
