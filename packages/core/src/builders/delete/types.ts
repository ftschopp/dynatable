import { OperationBuilder } from '../shared';

/**
 * Builder interface for DynamoDB DeleteItem operations
 */
export interface DeleteBuilder<Model> extends OperationBuilder<Model> {
  /**
   * Configures what values should be returned after the delete operation
   */
  returning(mode: 'NONE' | 'ALL_OLD'): DeleteBuilder<Model>;
}
