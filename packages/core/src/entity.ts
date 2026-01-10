import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InferInput, InferKeyInput, InferModel, ModelDefinition } from './core/types';
import { applyPostDefaults, resolveKeys, extractTemplateVars } from './utils/model-utils';
import { modelToZod } from './utils/zod-utils';
import {
  createGetBuilder,
  createPutBuilder,
  createQueryBuilder,
  createUpdateBuilder,
  createDeleteBuilder,
  createScanBuilder,
  createBatchGetBuilder,
  createBatchWriteBuilder,
  GetBuilder,
  PutBuilder,
  QueryBuilder,
  UpdateBuilder,
  DeleteBuilder,
  ScanBuilder,
  BatchGetBuilder,
  BatchWriteBuilder,
  WriteRequest,
} from './builders';
import { DynamoDBLogger } from './utils/dynamodb-logger';

/**
 * Options for creating the Entity API
 */
export type EntityAPIOptions = {
  logger?: DynamoDBLogger;
  timestamps?: boolean;
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

/**
 * Creates an entity API instance with validation, key resolution, and builder creation.
 *
 * @param modelName - The name of the model/entity
 * @param model - The model definition
 * @param client - DynamoDB client instance
 * @param options - Optional configuration (logger, timestamps)
 * @returns EntityAPI with get and put methods
 */
export const createEntityAPI = <Model extends ModelDefinition>(
  tableName: string,
  modelName: string,
  model: Model,
  client: DynamoDBClient,
  options: EntityAPIOptions = {}
): EntityAPI<InferModel<Model>, InferInput<Model>, InferKeyInput<Model>, Model> => {
  const { logger, timestamps = false } = options;

  // Build a Zod schema from the model
  const zodSchema = modelToZod(model);

  return {
    get(key) {
      // Extract required fields from key templates
      const requiredFields = new Set<string>();
      if (model.key) {
        for (const keyDef of Object.values(model.key)) {
          extractTemplateVars(keyDef.value).forEach((field) => requiredFields.add(field));
        }
      }

      // Check if all required fields are present
      const keyRecord = key as Record<string, unknown>;
      const missingFields = Array.from(requiredFields).filter(
        (field) => keyRecord[field] === undefined
      );

      if (missingFields.length > 0) {
        throw new Error(
          `[${modelName}] Missing required key field(s) for get(): ${missingFields.join(', ')}. ` +
            `Required fields: ${Array.from(requiredFields).join(', ')}`
        );
      }

      // Resolve any key defaults or computed keys
      const fullKey = resolveKeys(model, key);

      return createGetBuilder<InferKeyInput<Model>, InferModel<Model>>(
        tableName,
        fullKey,
        client,
        undefined,
        logger
      );
    },

    put(item) {
      // Validate full input data
      const parsed = zodSchema.parse(item);

      // Apply post-processing defaults from the model (including timestamps for new items)
      const withDefaults = applyPostDefaults(model, parsed, {
        isUpdate: false,
        timestamps,
      });

      // Resolve keys again with defaults
      const fullKey = resolveKeys(model, withDefaults);

      // Combine keys and data into full item, adding _type field
      const fullItem = {
        ...withDefaults,
        ...fullKey,
        _type: modelName, // Add entity type identifier
      };

      return createPutBuilder(tableName, fullItem, client, [], false, 'NONE', false, logger);
    },

    query() {
      return createQueryBuilder<InferModel<Model>, Model>(tableName, client, model, logger);
    },

    scan() {
      return createScanBuilder<InferModel<Model>>(
        tableName,
        client,
        [],
        [],
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        logger
      );
    },

    update(key) {
      // Extract required fields from key templates
      const requiredFields = new Set<string>();
      if (model.key) {
        for (const keyDef of Object.values(model.key)) {
          extractTemplateVars(keyDef.value).forEach((field) => requiredFields.add(field));
        }
      }

      // Check if all required fields are present
      const keyRecord = key as Record<string, unknown>;
      const missingFields = Array.from(requiredFields).filter(
        (field) => keyRecord[field] === undefined
      );

      if (missingFields.length > 0) {
        throw new Error(
          `[${modelName}] Missing required key field(s) for update(): ${missingFields.join(', ')}. ` +
            `Required fields: ${Array.from(requiredFields).join(', ')}`
        );
      }

      // Resolve any key defaults or computed keys
      const fullKey = resolveKeys(model, key);

      return createUpdateBuilder<InferModel<Model>>(
        tableName,
        fullKey as Partial<InferModel<Model>>,
        client,
        [],
        { set: [], remove: [], add: [], delete: [] },
        'NONE',
        0,
        timestamps,
        logger
      );
    },

    delete(key) {
      // Extract required fields from key templates
      const requiredFields = new Set<string>();
      if (model.key) {
        for (const keyDef of Object.values(model.key)) {
          extractTemplateVars(keyDef.value).forEach((field) => requiredFields.add(field));
        }
      }

      // Check if all required fields are present
      const keyRecord = key as Record<string, unknown>;
      const missingFields = Array.from(requiredFields).filter(
        (field) => keyRecord[field] === undefined
      );

      if (missingFields.length > 0) {
        throw new Error(
          `[${modelName}] Missing required key field(s) for delete(): ${missingFields.join(', ')}. ` +
            `Required fields: ${Array.from(requiredFields).join(', ')}`
        );
      }

      // Resolve any key defaults or computed keys
      const fullKey = resolveKeys(model, key);

      return createDeleteBuilder<InferModel<Model>>(
        tableName,
        fullKey as Partial<InferModel<Model>>,
        client,
        [],
        'NONE',
        logger
      );
    },

    batchGet(keys) {
      // Extract required fields from key templates
      const requiredFields = new Set<string>();
      if (model.key) {
        for (const keyDef of Object.values(model.key)) {
          extractTemplateVars(keyDef.value).forEach((field) => requiredFields.add(field));
        }
      }

      // Process all keys and validate them
      const resolvedKeys = keys.map((key) => {
        // Check if all required fields are present
        const keyRecord = key as Record<string, unknown>;
        const missingFields = Array.from(requiredFields).filter(
          (field) => keyRecord[field] === undefined
        );

        if (missingFields.length > 0) {
          throw new Error(
            `[${modelName}] Missing required key field(s) for batchGet(): ${missingFields.join(', ')}. ` +
              `Required fields: ${Array.from(requiredFields).join(', ')}`
          );
        }

        // Resolve any key defaults or computed keys
        return resolveKeys(model, key);
      });

      // Create the request items in the format expected by BatchGetItem
      const requestItems = {
        [tableName]: {
          Keys: resolvedKeys,
        },
      };

      return createBatchGetBuilder<InferModel<Model>>(requestItems, client, undefined, logger);
    },

    batchWrite(items) {
      // Validate and process all items
      const processedItems = items.map((item) => {
        // Validate full input data
        const parsed = zodSchema.parse(item);

        // Apply post-processing defaults from the model (including timestamps for new items)
        const withDefaults = applyPostDefaults(model, parsed, {
          isUpdate: false,
          timestamps,
        });

        // Resolve keys again with defaults
        const fullKey = resolveKeys(model, withDefaults);

        // Combine keys and data into full item, adding _type field
        return {
          ...withDefaults,
          ...fullKey,
          _type: modelName, // Add entity type identifier
        };
      });

      // Create the request items in the format expected by BatchWriteItem
      const requestItems: Record<string, WriteRequest[]> = {
        [tableName]: processedItems.map((item) => ({
          PutRequest: {
            Item: item,
          },
        })),
      };

      return createBatchWriteBuilder(requestItems, client, logger);
    },
  };
};
