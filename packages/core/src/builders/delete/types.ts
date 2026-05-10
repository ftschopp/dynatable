import type { DeleteCommandInput } from '@aws-sdk/lib-dynamodb';
import { OperationBuilder } from '../shared';

/**
 * Builder interface for DynamoDB DeleteItem operations
 */
export interface DeleteBuilder<Model> extends Omit<OperationBuilder<Model>, 'dbParams'> {
  /**
   * Configures what values should be returned after the delete operation
   */
  returning(mode: 'NONE' | 'ALL_OLD'): DeleteBuilder<Model>;

  /**
   * Configures the ReturnConsumedCapacity parameter so DynamoDB reports
   * how many WCUs the delete consumed. Useful for diagnosing throttling.
   *
   * - INDEXES: Returns consumed capacity for table and indexes
   * - TOTAL: Returns total consumed capacity
   * - NONE: No consumed capacity data returned (default)
   */
  returnConsumedCapacity(mode: 'INDEXES' | 'TOTAL' | 'NONE'): DeleteBuilder<Model>;

  /**
   * Converts the builder state to DynamoDB DeleteItem parameters
   */
  dbParams(): DeleteCommandInput;
}
