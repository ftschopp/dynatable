/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { TransactGetCommand } from '@aws-sdk/lib-dynamodb';
import { TransactGetBuilder, TransactGetState } from './types';

/**
 * Creates the initial state for a TransactGet builder
 */
const createInitialState = (client: DynamoDBClient): TransactGetState => ({
  client,
  items: [],
});

/**
 * Adds a Get operation to the transaction
 */
const addGetItem =
  (state: TransactGetState) =>
  (params: any): TransactGetState => ({
    ...state,
    items: [...state.items, { Get: params }],
  });

/**
 * Converts the builder state to DynamoDB parameters
 */
const toDbParams = (state: TransactGetState) => ({
  TransactItems: [...state.items] as any,
});

/**
 * Executes the transaction and returns the items
 */
const execute = async (state: TransactGetState): Promise<any[]> => {
  const params = toDbParams(state);
  const command = new TransactGetCommand(params);
  const response = await state.client.send(command);
  return response.Responses?.map((r: any) => r.Item) || [];
};

/**
 * Creates a builder from the current state
 */
const createBuilder = (state: TransactGetState): TransactGetBuilder => ({
  addGet: (params: any) => createBuilder(addGetItem(state)(params)),
  dbParams: () => toDbParams(state),
  execute: () => execute(state),
});

/**
 * Creates a new TransactGet builder
 *
 * @param client - DynamoDB client instance
 * @returns A TransactGetBuilder
 *
 * @example
 * ```typescript
 * const [user, photo] = await createTransactGetBuilder(client)
 *   .addGet(getUserParams)
 *   .addGet(getPhotoParams)
 *   .execute();
 * ```
 */
export const createTransactGetBuilder = (client: DynamoDBClient): TransactGetBuilder => {
  const initialState = createInitialState(client);
  return createBuilder(initialState);
};
