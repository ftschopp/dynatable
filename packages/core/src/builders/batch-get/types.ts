/* eslint-disable @typescript-eslint/no-explicit-any */
import { BatchGetItemCommandInput } from '@aws-sdk/client-dynamodb';

/**
 * BatchGetBuilder allows you to retrieve multiple items from one or more
 * tables in a single logical operation.
 *
 * `execute()` chunks the request into sub-requests of at most 100 keys
 * (DynamoDB's hard BatchGetItem limit) and retries any UnprocessedKeys
 * with exponential backoff. After the retry budget is exhausted, a
 * `BatchUnprocessedError` is thrown carrying whatever could not be retrieved.
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
   * Configure the maximum number of retry attempts per chunk when the
   * response carries UnprocessedKeys. Defaults to 3.
   */
  maxRetries(n: number): BatchGetBuilder<Model>;

  /**
   * Configure the initial exponential-backoff delay in milliseconds.
   * Subsequent retries wait `initial * 2^attempt` ms. Defaults to 50ms.
   */
  retryBackoffMs(ms: number): BatchGetBuilder<Model>;

  /**
   * Build the underlying DynamoDB BatchGetItem input parameters.
   *
   * **Note:** this returns the request as a single, unchunked
   * `BatchGetItem` input. If you have more than 100 keys total, sending
   * this directly to the SDK will fail at runtime — `execute()` is what
   * applies the chunking and retry logic.
   */
  dbParams(): BatchGetItemCommandInput;

  /**
   * Execute the BatchGetItem operation and return the items as a flat
   * array, aggregated across all chunks. Order across chunks is preserved
   * but the order *within* a chunk is whatever DynamoDB returns
   * (BatchGetItem does not guarantee item order).
   */
  execute(): Promise<Model[]>;
};
