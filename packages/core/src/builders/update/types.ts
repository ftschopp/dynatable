import { OperationBuilder, AttrRef } from '../shared';

/**
 * Update actions that can be performed on attributes
 */
export type UpdateAction = {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, any>;
};

/**
 * Builder interface for DynamoDB UpdateItem operations
 */
export interface UpdateBuilder<Model> extends OperationBuilder<Model> {
  /**
   * Sets an attribute to a specific value
   */
  set(attr: keyof Model | AttrRef, value: any): UpdateBuilder<Model>;

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
}
