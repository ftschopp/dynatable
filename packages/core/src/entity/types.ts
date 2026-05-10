import { DynamoDBLogger } from '@/utils/dynamodb-logger';
import {
  GetBuilder,
  PutBuilder,
  QueryBuilder,
  UpdateBuilder,
  DeleteBuilder,
  ScanBuilder,
  BatchGetBuilder,
  BatchWriteBuilder,
} from '@/builders';

/**
 * Options for creating the Entity API
 */
export type EntityAPIOptions = {
  logger?: DynamoDBLogger;
  timestamps?: boolean;
  cleanInternalKeys?: boolean;
  /**
   * Schema-derived list of column names that `cleanInternalKeys` should
   * strip from returned items. When omitted, falls back to the default
   * `['PK', 'SK', '_type']` — which misses GSI/LSI columns and any
   * primary key not literally named `PK` / `SK`. The Table constructor
   * always populates this from `schema.indexes`.
   */
  internalKeys?: readonly string[];
};

/**
 * Entity API interface for a model
 */
export type EntityAPI<Model, Input, KeyInput> = {
  /**
   * Retrieves an item by its key.
   * @param key - Partial or full key object to identify the item
   * @returns GetBuilder configured for the item
   */
  get: (key: KeyInput) => GetBuilder<KeyInput, Model>;

  /**
   * Puts an item into the table after validation and applying defaults.
   * @param item - The input data to put
   * @returns PutBuilder configured for the item
   */
  put: (item: Input) => PutBuilder<Model>;

  /**
   * Queries items using key conditions.
   * @returns QueryBuilder for building and executing the query
   */
  query: () => QueryBuilder<Model>;

  /**
   * Scans the entire table or index without key conditions.
   * @returns ScanBuilder for building and executing the scan
   */
  scan: () => ScanBuilder<Model>;

  /**
   * Updates an item by its key.
   * @param key - Partial or full key object to identify the item
   * @returns UpdateBuilder configured for the item
   */
  update: (key: KeyInput) => UpdateBuilder<Model>;

  /**
   * Deletes an item by its key.
   * @param key - Partial or full key object to identify the item
   * @returns DeleteBuilder configured for the item
   */
  delete: (key: KeyInput) => DeleteBuilder<Model>;

  /**
   * Retrieves multiple items by their keys in a single batch operation.
   * @param keys - Array of key objects to retrieve
   * @returns BatchGetBuilder configured for the items
   */
  batchGet: (keys: KeyInput[]) => BatchGetBuilder<Model>;

  /**
   * Writes multiple items in a single batch operation.
   *
   * Accepts any number of items: `execute()` chunks the request into
   * sub-requests of at most 25 items (DynamoDB's hard `BatchWriteItem`
   * limit) and retries any UnprocessedItems with exponential backoff.
   * If items remain unprocessed after the retry budget, a
   * `BatchUnprocessedError` is thrown.
   *
   * @param items - Items to put. No upper bound — chunking is transparent.
   * @returns BatchWriteBuilder configured for the items
   */
  batchWrite: (items: Input[]) => BatchWriteBuilder;
};
