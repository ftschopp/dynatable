/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * Represents a single Get operation in a TransactGet
 */
export type TransactGetItem = {
  Get: {
    TableName: string;
    Key: Record<string, any>;
    ProjectionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
  };
};

/**
 * State for the TransactGet builder
 */
export type TransactGetState = {
  readonly client: DynamoDBClient;
  readonly items: readonly TransactGetItem[];
};

/**
 * TransactGet builder interface
 */
export type TransactGetBuilder = {
  readonly addGet: (params: any) => TransactGetBuilder;
  readonly dbParams: () => any;
  readonly execute: () => Promise<any[]>;
};
