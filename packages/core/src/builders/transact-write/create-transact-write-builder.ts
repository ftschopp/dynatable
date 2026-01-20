import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  TransactWriteBuilder,
  TransactWriteState,
  TransactPutParams,
  TransactUpdateParams,
  TransactDeleteParams,
  TransactConditionCheckParams,
} from './types';

/**
 * Creates the initial state for a TransactWrite builder
 */
const createInitialState = (client: DynamoDBClient): TransactWriteState => ({
  client,
  items: [],
});

/**
 * Adds a Put operation to the transaction
 */
const addPutItem =
  (state: TransactWriteState) =>
  (params: TransactPutParams): TransactWriteState => ({
    ...state,
    items: [...state.items, { Put: params }],
  });

/**
 * Adds an Update operation to the transaction
 */
const addUpdateItem =
  (state: TransactWriteState) =>
  (params: TransactUpdateParams): TransactWriteState => ({
    ...state,
    items: [...state.items, { Update: params }],
  });

/**
 * Adds a Delete operation to the transaction
 */
const addDeleteItem =
  (state: TransactWriteState) =>
  (params: TransactDeleteParams): TransactWriteState => ({
    ...state,
    items: [...state.items, { Delete: params }],
  });

/**
 * Adds a ConditionCheck operation to the transaction
 */
const addConditionCheckItem =
  (state: TransactWriteState) =>
  (params: TransactConditionCheckParams): TransactWriteState => ({
    ...state,
    items: [...state.items, { ConditionCheck: params }],
  });

/**
 * Sets the client request token for idempotency
 */
const setClientRequestToken =
  (state: TransactWriteState) =>
  (token: string): TransactWriteState => ({
    ...state,
    clientRequestToken: token,
  });

/**
 * Converts the builder state to DynamoDB parameters
 */
const toDbParams = (state: TransactWriteState): ReturnType<TransactWriteBuilder['dbParams']> => {
  const params: ReturnType<TransactWriteBuilder['dbParams']> = {
    TransactItems: [...state.items],
  };

  if (state.clientRequestToken) {
    params.ClientRequestToken = state.clientRequestToken;
  }

  return params;
};

/**
 * Executes the transaction
 */
const execute = async (state: TransactWriteState) => {
  const params = toDbParams(state);
  const command = new TransactWriteCommand(params);
  return await state.client.send(command);
};

/**
 * Creates a builder from the current state
 */
const createBuilder = (state: TransactWriteState): TransactWriteBuilder => ({
  addPut: (params) => createBuilder(addPutItem(state)(params)),
  addUpdate: (params) => createBuilder(addUpdateItem(state)(params)),
  addDelete: (params) => createBuilder(addDeleteItem(state)(params)),
  addConditionCheck: (params) => createBuilder(addConditionCheckItem(state)(params)),
  withClientRequestToken: (token) => createBuilder(setClientRequestToken(state)(token)),
  dbParams: () => toDbParams(state),
  execute: () => execute(state),
});

/**
 * Creates a new TransactWrite builder
 *
 * @param client - DynamoDB client instance
 * @returns A TransactWriteBuilder
 *
 * @example
 * ```typescript
 * const result = await createTransactWriteBuilder(client)
 *   .addPut(putParams)
 *   .addUpdate(updateParams)
 *   .execute();
 * ```
 */
export const createTransactWriteBuilder = (client: DynamoDBClient): TransactWriteBuilder => {
  const initialState = createInitialState(client);
  return createBuilder(initialState);
};
