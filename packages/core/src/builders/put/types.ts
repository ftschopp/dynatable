import type { PutCommandInput } from '@aws-sdk/lib-dynamodb';
import { OperationBuilder, AttrBuilder, OpBuilder, Condition } from '../shared';

/**
 * Builder interface for DynamoDB PutItem operations
 */
export interface PutBuilder<Model> extends Omit<OperationBuilder<Model>, 'dbParams' | 'where'> {
  /**
   * Adds a condition expression to the put operation. Returns a new
   * immutable builder.
   *
   * Override of `OperationBuilder.where(): this` because `Omit<>` doesn't
   * preserve `this`-polymorphism — chains like `.where(...).ifNotExists()`
   * would otherwise widen to `OperationBuilder<Model>` and lose the
   * put-specific methods.
   */
  where(fn: (attr: AttrBuilder<Model>, op: OpBuilder) => Condition): PutBuilder<Model>;

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
   * Configures the ReturnConsumedCapacity parameter so DynamoDB reports
   * how many WCUs the put consumed. Useful for diagnosing throttling and
   * accounting for index amplification on tables with multiple GSIs.
   *
   * - INDEXES: Returns consumed capacity for table and indexes
   * - TOTAL: Returns total consumed capacity
   * - NONE: No consumed capacity data returned (default)
   */
  returnConsumedCapacity(mode: 'INDEXES' | 'TOTAL' | 'NONE'): PutBuilder<Model>;

  /**
   * Converts the builder state to DynamoDB PutItem parameters
   */
  dbParams(): PutCommandInput;
}
