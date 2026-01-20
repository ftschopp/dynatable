/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type {
  TransactWriteCommandInput,
  TransactWriteCommandOutput,
  PutCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
} from '@aws-sdk/lib-dynamodb';

// Extract types from AWS SDK's TransactWriteCommandInput
type TransactWriteItems = NonNullable<TransactWriteCommandInput['TransactItems']>;
type StrictTransactPut = NonNullable<TransactWriteItems[number]['Put']>;
type StrictTransactUpdate = NonNullable<TransactWriteItems[number]['Update']>;
type StrictTransactDelete = NonNullable<TransactWriteItems[number]['Delete']>;
type StrictTransactConditionCheck = NonNullable<TransactWriteItems[number]['ConditionCheck']>;

/**
 * Parameters for a Put operation within a transaction
 * Accepts both regular PutCommandInput and strict transaction Put params
 */
export type TransactPutParams = PutCommandInput | StrictTransactPut;

/**
 * Parameters for an Update operation within a transaction
 * Accepts both regular UpdateCommandInput and strict transaction Update params
 */
export type TransactUpdateParams = UpdateCommandInput | StrictTransactUpdate;

/**
 * Parameters for a Delete operation within a transaction
 * Accepts both regular DeleteCommandInput and strict transaction Delete params
 */
export type TransactDeleteParams = DeleteCommandInput | StrictTransactDelete;

/**
 * Parameters for a ConditionCheck operation within a transaction
 */
export type TransactConditionCheckParams = StrictTransactConditionCheck;

/**
 * Represents a single item in a TransactWrite operation
 * Using any internally to allow flexibility between CommandInput and strict transaction types
 */
export type TransactWriteItem =
  | { Put: any }
  | { Update: any }
  | { Delete: any }
  | { ConditionCheck: any };

/**
 * State for the TransactWrite builder
 */
export type TransactWriteState = {
  readonly client: DynamoDBClient;
  readonly items: readonly TransactWriteItem[];
  readonly clientRequestToken?: string;
};

/**
 * TransactWrite builder interface
 */
export type TransactWriteBuilder = {
  readonly addPut: (params: TransactPutParams) => TransactWriteBuilder;
  readonly addUpdate: (params: TransactUpdateParams) => TransactWriteBuilder;
  readonly addDelete: (params: TransactDeleteParams) => TransactWriteBuilder;
  readonly addConditionCheck: (params: TransactConditionCheckParams) => TransactWriteBuilder;
  readonly withClientRequestToken: (token: string) => TransactWriteBuilder;
  readonly dbParams: () => TransactWriteCommandInput;
  readonly execute: () => Promise<TransactWriteCommandOutput>;
};
