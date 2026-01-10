/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * Represents a single item in a TransactWrite operation
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
  readonly addPut: (params: any) => TransactWriteBuilder;
  readonly addUpdate: (params: any) => TransactWriteBuilder;
  readonly addDelete: (params: any) => TransactWriteBuilder;
  readonly addConditionCheck: (params: any) => TransactWriteBuilder;
  readonly withClientRequestToken: (token: string) => TransactWriteBuilder;
  readonly dbParams: () => any;
  readonly execute: () => Promise<any>;
};
