/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InferInput, InferKeyInput, InferModel, ModelDefinition } from '@/core/types';
import { applyPostDefaults, resolveKeys } from '@/utils/model-utils';
import { modelToZod } from '@/utils/zod-utils';
import {
  createGetBuilder,
  createPutBuilder,
  createQueryBuilder,
  createUpdateBuilder,
  createDeleteBuilder,
  createScanBuilder,
  createBatchGetBuilder,
  createBatchWriteBuilder,
  WriteRequest,
} from '@/builders';
import { EntityAPI, EntityAPIOptions } from './types';
import { withMiddleware } from './middleware/with-middleware';
import { createCleanKeysMiddleware } from './middleware/factories';
import { validateKeyFields } from './validation/key-validation';

/**
 * Creates an entity API instance with validation, key resolution, and builder creation.
 *
 * @param tableName - The name of the DynamoDB table
 * @param modelName - The name of the model/entity
 * @param model - The model definition
 * @param client - DynamoDB client instance
 * @param options - Optional configuration (logger, timestamps, cleanInternalKeys)
 * @returns EntityAPI with get, put, query, scan, update, delete, batchGet, and batchWrite methods
 */
export const createEntityAPI = <Model extends ModelDefinition>(
  tableName: string,
  modelName: string,
  model: Model,
  client: DynamoDBClient,
  options: EntityAPIOptions = {}
): EntityAPI<InferModel<Model>, InferInput<Model>, InferKeyInput<Model>> => {
  const { logger, timestamps = false, cleanInternalKeys = false } = options;

  // Build a Zod schema from the model
  const zodSchema = modelToZod(model);

  return {
    get(key) {
      // Validate key fields
      validateKeyFields(modelName, model, key as Record<string, unknown>, 'get()');

      // Resolve any key defaults or computed keys
      const fullKey = resolveKeys(model, key);

      const builder = createGetBuilder<InferKeyInput<Model>, InferModel<Model>>(
        tableName,
        fullKey,
        client,
        undefined,
        logger
      );

      return withMiddleware(builder, createCleanKeysMiddleware(cleanInternalKeys));
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
      // Query builder doesn't have execute() until after .where() is called
      // The cleanInternalKeys will be handled in the builder itself
      return createQueryBuilder<InferModel<Model>>(tableName, client, model, logger);
    },

    scan() {
      const builder = createScanBuilder<InferModel<Model>>(
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

      return withMiddleware(builder, createCleanKeysMiddleware(cleanInternalKeys));
    },

    update(key) {
      // Validate key fields
      validateKeyFields(modelName, model, key as Record<string, unknown>, 'update()');

      // Resolve any key defaults or computed keys
      const fullKey = resolveKeys(model, key);

      const builder = createUpdateBuilder<InferModel<Model>>(
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

      return withMiddleware(builder, createCleanKeysMiddleware(cleanInternalKeys));
    },

    delete(key) {
      // Validate key fields
      validateKeyFields(modelName, model, key as Record<string, unknown>, 'delete()');

      // Resolve any key defaults or computed keys
      const fullKey = resolveKeys(model, key);

      const builder = createDeleteBuilder<InferModel<Model>>(
        tableName,
        fullKey as Partial<InferModel<Model>>,
        client,
        [],
        'NONE',
        logger
      );

      return withMiddleware(builder, createCleanKeysMiddleware(cleanInternalKeys));
    },

    batchGet(keys) {
      // Process all keys and validate them
      const resolvedKeys = keys.map((key) => {
        // Validate key fields
        validateKeyFields(modelName, model, key as Record<string, unknown>, 'batchGet()');

        // Resolve any key defaults or computed keys
        return resolveKeys(model, key);
      });

      // Create the request items in the format expected by BatchGetItem
      const requestItems = {
        [tableName]: {
          Keys: resolvedKeys,
        },
      };

      const builder = createBatchGetBuilder<InferModel<Model>>(
        requestItems,
        client,
        undefined,
        logger
      );

      return withMiddleware(builder, createCleanKeysMiddleware(cleanInternalKeys));
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
