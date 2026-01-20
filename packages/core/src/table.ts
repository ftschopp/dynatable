/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  InferKeyInput,
  InferModelFromSchema,
  InferInputFromSchema,
  SchemaDefinition,
} from './core/types';
import { createEntityAPI, EntityAPI } from './entity';
import { createTransactWriteBuilder, TransactWriteBuilder } from './builders/transact-write';
import { createTransactGetBuilder, TransactGetBuilder } from './builders/transact-get';
import { DynamoDBLogger } from './utils/dynamodb-logger';

/**
 * Configuration options for the Table instance
 */
export type TableConfig<S extends SchemaDefinition> = {
  /** The DynamoDB table name */
  name: string;
  /** AWS DynamoDB client instance */
  client: DynamoDBClient;
  /** Optional logger instance for DynamoDB operations */
  logger?: DynamoDBLogger;
  /** The schema definition for all models in the table */
  schema: S;
};

/**
 * Internal helper type to infer all entity APIs from schema definition
 */
type EntityMap<S extends SchemaDefinition> = {
  [K in keyof S['models']]: EntityAPI<
    InferModelFromSchema<S, K>,
    InferInputFromSchema<S, K>,
    InferKeyInput<S['models'][K]>
  >;
};

/**
 * Represents a typed DynamoDB Table with entity APIs
 *
 * Provides access to all entity operations (get, put, delete, etc.)
 * via `table.entities.<EntityName>`.
 */
export class Table<S extends SchemaDefinition> {
  /** Generated entity APIs */
  public readonly entities: EntityMap<S>;

  /** DynamoDB client */
  private readonly client: DynamoDBClient;

  constructor(config: TableConfig<S>) {
    const { client, schema, logger, name: tableName } = config;

    this.client = client;

    const rawEntities: Record<string, any> = {};

    for (const modelName in schema.models) {
      const model = schema.models[modelName];
      if (!model) {
        throw new Error(`Model '${modelName}' is missing in schema`);
      }

      rawEntities[modelName] = createEntityAPI(tableName, modelName, model, client, {
        logger,
        timestamps: schema.params?.timestamps ?? false,
        cleanInternalKeys: schema.params?.cleanInternalKeys ?? false,
      });
    }

    this.entities = rawEntities as EntityMap<S>;
  }

  /**
   * Creates a new TransactWrite builder for atomic multi-item write operations
   *
   * @returns A TransactWriteBuilder instance
   *
   * @example
   * ```typescript
   * // Like a photo atomically
   * await table.transactWrite()
   *   .addPut(table.entities.Like.put({ photoId: "123", likingUsername: "alice" }).dbParams())
   *   .addUpdate(table.entities.Photo.update({ username: "bob", photoId: "123" }).add("likesCount", 1).dbParams())
   *   .execute();
   * ```
   */
  transactWrite(): TransactWriteBuilder {
    return createTransactWriteBuilder(this.client);
  }

  /**
   * Creates a new TransactGet builder for atomic multi-item read operations
   *
   * @returns A TransactGetBuilder instance
   *
   * @example
   * ```typescript
   * // Get user and photo atomically
   * const [user, photo] = await table.transactGet()
   *   .addGet(table.entities.User.get({ username: "alice" }).dbParams())
   *   .addGet(table.entities.Photo.get({ username: "alice", photoId: "123" }).dbParams())
   *   .execute();
   * ```
   */
  transactGet(): TransactGetBuilder {
    return createTransactGetBuilder(this.client);
  }
}
