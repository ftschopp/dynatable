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
 * in a single request.
 */
export type BatchWriteBuilder = {
  /**
   * Build the underlying DynamoDB BatchWriteItem input parameters.
   */
  dbParams(): BatchWriteItemCommandInput;

  /**
   * Execute the BatchWriteItem command.
   * Returns unprocessed items if any requests failed.
   */
  execute(): Promise<{
    unprocessedItems?: Record<string, WriteRequest[]>;
  }>;
};
