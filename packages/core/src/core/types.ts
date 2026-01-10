/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Type definitions for DynamoDB schema and model inference
 *
 * Provides comprehensive type utilities for:
 * - Defining DynamoDB table schemas with primary and secondary indexes
 * - Inferring strongly-typed input and output models from schema definitions
 * - Automatic key generation and template variable extraction
 * - Type-safe attribute handling with support for defaults and auto-generation
 *
 * @example
 * ```typescript
 * const schema: SchemaDefinition = {
 *   format: 'dynatable:1.0.0',
 *   version: '1.0.0',
 *   indexes: { primary: { hash: "PK", sort: "SK" } },
 *   models: {
 *     User: {
 *       key: { PK: { type: String, value: "USER#${id}" }, SK: { type: String, value: "PROFILE" } },
 *       attributes: { id: { type: String, required: true }, name: { type: String } }
 *     }
 *   }
 * };
 * ```
 */

// -------------------- Type Definitions --------------------

/**
 * Attribute definition for model attributes
 *
 * @property type - The JavaScript constructor for the attribute type
 * @property [required] - Whether the attribute is required
 * @property [generate] - Auto-generation strategy ('ulid', 'uuid')
 * @property [default] - Default value or generator function
 */
export type AttributeDefinition = {
  type: StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor;
  required?: boolean;
  generate?: 'ulid' | 'uuid';
  default?: any;
};

/**
 * Key definition for primary and secondary indexes
 *
 * @property type - Always String for DynamoDB keys
 * @property value - Template string for key generation
 */
export type KeyDefinition = {
  type: StringConstructor;
  value: string;
};

/**
 * Primary key definition - requires both PK and SK (uppercase)
 */
export type PrimaryKeyDefinition = {
  PK: KeyDefinition;
  SK: KeyDefinition;
};

/**
 * Index definition with hash and optional sort key
 */
export type IndexDefinition = {
  hash: string;
  sort?: string;
};

/**
 * Indexes configuration - requires at least a primary index
 */
export type IndexesDefinition = {
  primary: IndexDefinition;
  [indexName: string]: IndexDefinition;
};

/**
 * Model definition containing keys, indexes, and attributes
 * - key: REQUIRED, must have pk and sk
 * - attributes: REQUIRED, model attributes
 * - index: OPTIONAL, secondary index keys
 */
export type ModelDefinition = {
  key: PrimaryKeyDefinition;
  index?: Record<string, KeyDefinition>;
  attributes: Record<string, AttributeDefinition>;
};

/**
 * Schema parameters configuration
 */
export type SchemaParams = {
  isoDates?: boolean;
  timestamps?: boolean;
};

/**
 * Complete schema definition for a DynamoDB table
 * - format: Table schema format version (e.g., "dynatable:1.0.0")
 * - version: Schema version (e.g., "1.0.0")
 * - indexes: Index definitions (requires at least 'primary')
 * - models: Model definitions (each requires 'key' and 'attributes')
 * - params: Optional schema parameters
 */
export type SchemaDefinition = {
  format: string;
  version: string;
  indexes: IndexesDefinition;
  models: Record<string, ModelDefinition>;
  params?: SchemaParams;
};

type InferAttr<T> = T extends StringConstructor
  ? string
  : T extends NumberConstructor
    ? number
    : T extends BooleanConstructor
      ? boolean
      : T extends DateConstructor
        ? Date
        : unknown;

type IsOptional<T> = undefined extends T ? true : false;

/**
 * Non-generated attributes for input
 * Splits into required and optional based on the 'required' field
 */
type NonGeneratedAttributes<M extends ModelDefinition> = {
  [K in keyof M['attributes'] as M['attributes'][K] extends { generate: string }
    ? never
    : M['attributes'][K] extends { required: true }
      ? K
      : never]: InferAttr<M['attributes'][K]['type']>;
} & {
  [K in keyof M['attributes'] as M['attributes'][K] extends { generate: string }
    ? never
    : M['attributes'][K] extends { required: false }
      ? K
      : M['attributes'][K] extends { required: true }
        ? never
        : K]?: InferAttr<M['attributes'][K]['type']>;
};

/**
 * Generated-only attributes for internal use
 */
type GeneratedAttributes<M extends ModelDefinition> = {
  [K in keyof M['attributes'] as M['attributes'][K] extends { generate: string }
    ? K
    : never]: InferAttr<M['attributes'][K]['type']>;
};

/**
 * Template string variable extraction
 */
type ExtractTemplateVars<S extends string> = S extends `${string}\${${infer Var}}${infer Rest}`
  ? Var | ExtractTemplateVars<Rest>
  : never;

/**
 * Extract template variables from primary keys (PK and SK)
 */
type PrimaryKeyVars<M extends ModelDefinition> =
  | ExtractTemplateVars<M['key']['PK']['value']>
  | ExtractTemplateVars<M['key']['SK']['value']>;

/**
 * Extract template variables from index keys (if they exist)
 */
type IndexKeyVars<M extends ModelDefinition> =
  M['index'] extends Record<string, KeyDefinition>
    ? {
        [K in keyof M['index']]: ExtractTemplateVars<M['index'][K]['value']>;
      }[keyof M['index']]
    : never;

/**
 * Extract all template variables from primary and index keys
 */
type KeyVars<M extends ModelDefinition> = PrimaryKeyVars<M> | IndexKeyVars<M>;

type IsGenerated<M extends ModelDefinition, K extends string> = K extends keyof M['attributes']
  ? M['attributes'][K] extends { generate: string }
    ? true
    : false
  : false;

type FilterNonGeneratedKeyVars<
  M extends ModelDefinition,
  K extends string = KeyVars<M>,
> = K extends string ? (IsGenerated<M, K> extends true ? never : K) : never;

/**
 * Keys required in input
 */
type RequiredKeys<M extends ModelDefinition> = {
  [K in keyof NonGeneratedAttributes<M>]: M['attributes'][K] extends {
    required: true;
  }
    ? K
    : never;
}[keyof NonGeneratedAttributes<M>];

/**
 * Input type used for put/update
 *
 * @deprecated Use InferInputFromSchema when possible to get timestamp inference
 */
export type InferInput<M extends ModelDefinition> = {
  [K in keyof NonGeneratedAttributes<M> as K extends RequiredKeys<M>
    ? K
    : never]: NonGeneratedAttributes<M>[K];
} & {
  [K in keyof NonGeneratedAttributes<M> as K extends RequiredKeys<M>
    ? never
    : K]?: NonGeneratedAttributes<M>[K];
} & {
  [K in FilterNonGeneratedKeyVars<M>]: string;
};

/**
 * Infers the input type from a complete schema definition
 * When timestamps are enabled, createdAt and updatedAt are NOT included (auto-generated)
 */
export type InferInputFromSchema<
  S extends SchemaDefinition,
  ModelName extends keyof S['models'],
> = InferInput<S['models'][ModelName]>;

/**
 * Full model type after applying defaults and keys
 */
type ModelAttributes<M extends ModelDefinition> = NonGeneratedAttributes<M> &
  GeneratedAttributes<M>;

/**
 * Timestamp fields that are automatically added when timestamps are enabled
 */
export type TimestampFields = {
  createdAt: string;
  updatedAt: string;
};

/**
 * Infers the model type without exposing internal DynamoDB keys (PK, SK, GSI1PK, etc.)
 * Only includes business attributes and generated fields
 *
 * @deprecated Use InferModelFromSchema when possible to get timestamp inference
 */
export type InferModel<M extends ModelDefinition> = ModelAttributes<M>;

/**
 * Infers the model type from a complete schema definition
 * Automatically includes timestamp fields (createdAt, updatedAt) when params.timestamps is true
 */
export type InferModelFromSchema<
  S extends SchemaDefinition,
  ModelName extends keyof S['models'],
> = S['params'] extends { timestamps: true }
  ? ModelAttributes<S['models'][ModelName]> & TimestampFields
  : ModelAttributes<S['models'][ModelName]>;

/**
 * Internal type that includes DynamoDB keys - used internally by builders
 * Includes pk, sk, and any index keys
 * @internal
 */
export type InferModelWithKeys<M extends ModelDefinition> = ModelAttributes<M> & {
  [K in keyof M['key']]: string;
} & (M['index'] extends Record<string, KeyDefinition>
    ? {
        [K in keyof M['index']]: string;
      }
    : Record<string, never>);

/**
 * Extract template variables from primary keys only
 */
type KeyTemplateVars<M extends ModelDefinition> = PrimaryKeyVars<M>;

/**
 * Input for get/delete operations (only key template vars)
 */
export type InferKeyInput<M extends ModelDefinition> = {
  [K in KeyTemplateVars<M>]: string;
};
