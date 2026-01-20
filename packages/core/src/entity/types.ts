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
import { ModelDefinition } from '@/core/types';

/**
 * Options for creating the Entity API
 */
export type EntityAPIOptions = {
  logger?: DynamoDBLogger;
  timestamps?: boolean;
  cleanInternalKeys?: boolean;
};

/**
 * Entity API interface for a model
 */
export type EntityAPI<Model, Input, KeyInput, ModelDef extends ModelDefinition = any> = {
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
  query: () => QueryBuilder<Model, ModelDef>;

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
   * Writes multiple items in a single batch operation (puts or deletes).
   * @param items - Array of items to put
   * @returns BatchWriteBuilder configured for the items
   */
  batchWrite: (items: Input[]) => BatchWriteBuilder;
};
