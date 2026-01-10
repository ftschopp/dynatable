/* eslint-disable @typescript-eslint/no-explicit-any */
import { BatchGetItemCommandInput } from '@aws-sdk/client-dynamodb';

/**
 * BatchGetBuilder allows you to retrieve multiple items from one or more tables
 * in a single request.
 */
export type BatchGetBuilder<Model> = {
  /**
   * Select only specific attributes to retrieve for all items.
   */
  select(attrs: (keyof Model)[]): BatchGetBuilder<Model>;

  /**
   * Enable strongly consistent read for all items.
   */
  consistentRead(): BatchGetBuilder<Model>;

  /**
   * Build the underlying DynamoDB BatchGetItem input parameters.
   */
  dbParams(): BatchGetItemCommandInput;

  /**
   * Execute the BatchGetItem command and return the items.
   * Returns an object mapping table names to arrays of items.
   */
  execute(): Promise<Record<string, Model[]>>;
};
