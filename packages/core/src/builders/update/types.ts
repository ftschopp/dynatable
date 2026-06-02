import type { UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { ModelDefinition } from '@/core/types';
import { OperationBuilder, AttrRef, AttrBuilder, OpBuilder, Condition } from '../shared';

/**
 * Update actions that can be performed on attributes
 */
export type UpdateAction = {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, any>;
};

/**
 * Context that lets the update builder auto-recompute secondary-index keys
 * when a `.set()` touches a field that participates in their templates.
 *
 * `keyVars` carries the original template-variable values used to build the
 * primary key (e.g. `{ id: '123' }` from `update({ id: '123' })`) so they can
 * be combined with the user's `.set()` payload when resolving index templates.
 */
export type IndexContext = {
  model: ModelDefinition;
  keyVars: Record<string, any>;
};

/**
 * Builder interface for DynamoDB UpdateItem operations
 */
export interface UpdateBuilder<Model> extends Omit<OperationBuilder<Model>, 'dbParams' | 'where'> {
  /**
   * Adds a condition expression to the update operation. Returns a new
   * immutable builder.
   *
   * Override of `OperationBuilder.where(): this` because `Omit<>` doesn't
   * preserve `this`-polymorphism — chains like `.where(...).set(...)` or
   * `.where(...).returning(...)` would otherwise widen to
   * `OperationBuilder<Model>` and lose the update-specific methods.
   */
  where(fn: (attr: AttrBuilder<Model>, op: OpBuilder) => Condition): UpdateBuilder<Model>;

  /**
   * Sets an attribute to a specific value, or sets multiple attributes at once
   */
  set(attr: keyof Model | AttrRef, value: any): UpdateBuilder<Model>;
  set(updates: Partial<Model>): UpdateBuilder<Model>;

  /**
   * Conditionally sets an attribute only if it does not already exist on the
   * item, using DynamoDB's `if_not_exists()` SET function. Emits
   * `#attr = if_not_exists(#attr, :v)`.
   *
   * Primary use case: upsert patterns where some fields must be written only
   * on first insert (immutable `createdAt`, `firstSeenAt`, initial counters).
   *
   * Restrictions enforced at `dbParams()` time:
   * - The field must not participate in the primary-key template (PK is
   *   immutable; the conditional write is meaningless).
   * - The field must not participate in any secondary-index template,
   *   because the resolved value is decided by DynamoDB at write time and
   *   the index key cannot be recomputed safely.
   * - The same attribute cannot also be targeted by `.set()` in the same
   *   update — DynamoDB rejects overlapping document paths.
   */
  setIfNotExists(attr: keyof Model | AttrRef, value: any): UpdateBuilder<Model>;
  setIfNotExists(updates: Partial<Model>): UpdateBuilder<Model>;

  /**
   * Removes an attribute from the item
   */
  remove(attr: keyof Model | AttrRef): UpdateBuilder<Model>;

  /**
   * Adds a value to a number attribute or adds elements to a set
   */
  add(attr: keyof Model | AttrRef, value: any): UpdateBuilder<Model>;

  /**
   * Deletes elements from a set attribute
   */
  delete(attr: keyof Model | AttrRef, value: any): UpdateBuilder<Model>;

  /**
   * Configures what values should be returned after the update operation
   */
  returning(
    mode: 'NONE' | 'ALL_OLD' | 'ALL_NEW' | 'UPDATED_OLD' | 'UPDATED_NEW'
  ): UpdateBuilder<Model>;

  /**
   * Configures the ReturnConsumedCapacity parameter so DynamoDB reports
   * how many WCUs the update consumed. Useful for diagnosing throttling
   * and validating cost when index keys are auto-recomputed.
   *
   * - INDEXES: Returns consumed capacity for table and indexes
   * - TOTAL: Returns total consumed capacity
   * - NONE: No consumed capacity data returned (default)
   */
  returnConsumedCapacity(mode: 'INDEXES' | 'TOTAL' | 'NONE'): UpdateBuilder<Model>;

  /**
   * Converts the builder state to DynamoDB UpdateItem parameters
   */
  dbParams(): UpdateCommandInput;
}
