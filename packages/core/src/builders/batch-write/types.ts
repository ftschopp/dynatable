/* eslint-disable @typescript-eslint/no-explicit-any */
import { BatchWriteItemCommandInput } from '@aws-sdk/client-dynamodb';

/**
 * A single write request that can be either a PutRequest or DeleteRequest
 */
export type WriteRequest = {
  PutRequest?: {
    Item: any;
  };
  DeleteRequest?: {
    Key: any;
  };
};

/**
 * BatchWriteBuilder allows you to put or delete multiple items from one or more tables
 * in a single logical operation.
 *
 * `execute()` chunks the request into sub-requests of at most 25 items
 * (DynamoDB's hard BatchWriteItem limit) and retries any UnprocessedItems
 * with exponential backoff. After the retry budget is exhausted, a
 * `BatchUnprocessedError` is thrown carrying whatever could not be processed.
 */
export type BatchWriteBuilder = {
  /**
   * Configure the maximum number of retry attempts per chunk when the
   * response carries UnprocessedItems. Defaults to 3.
   */
  maxRetries(n: number): BatchWriteBuilder;

  /**
   * Configure the initial exponential-backoff delay in milliseconds.
   * Subsequent retries wait `initial * 2^attempt` ms. Defaults to 50ms.
   */
  retryBackoffMs(ms: number): BatchWriteBuilder;

  /**
   * Build the underlying DynamoDB BatchWriteItem input parameters.
   *
   * **Note:** this returns the request as a single, unchunked
   * `BatchWriteItem` input. If you have more than 25 items total, sending
   * this directly to the SDK will fail at runtime — `execute()` is what
   * applies the chunking and retry logic.
   */
  dbParams(): BatchWriteItemCommandInput;

  /**
   * Execute the BatchWriteItem operation.
   *
   * Internally chunks `RequestItems` to at most 25 items per SDK call and
   * retries any UnprocessedItems with exponential backoff (default 3
   * retries, configurable via {@link maxRetries}). Throws
   * `BatchUnprocessedError` if items remain unprocessed after the budget.
   *
   * On success the resolved value is `{}` — there is nothing left to
   * report. The legacy `unprocessedItems` field is no longer populated
   * because partial success now surfaces as a thrown error.
   */
  execute(): Promise<{
    unprocessedItems?: Record<string, WriteRequest[]>;
  }>;
};
