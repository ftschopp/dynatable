/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, GetCommandInput, GetCommandOutput } from '@aws-sdk/lib-dynamodb';
import { GetBuilder } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';

/**
 * Builds a ProjectionExpression with proper ExpressionAttributeNames
 * to handle reserved words and special characters.
 */
function buildProjectionExpression(attrs: string[]): {
  ProjectionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
} {
  const names: Record<string, string> = {};
  const projectionParts: string[] = [];

  attrs.forEach((attr) => {
    // Use a placeholder for the attribute name to avoid reserved word conflicts
    const placeholder = `#${attr}`;
    names[placeholder] = attr;
    projectionParts.push(placeholder);
  });

  return {
    ProjectionExpression: projectionParts.join(', '),
    ExpressionAttributeNames: names,
  };
}

/**
 * Creates a GetBuilder to retrieve an item by its key.
 */
export function createGetBuilder<KeyInput, Model>(
  tableName: string,
  key: Record<string, any>,
  client: DynamoDBClient,
  options?: {
    projection?: (keyof Model)[];
    consistentRead?: boolean;
    returnConsumedCapacity?: 'INDEXES' | 'TOTAL' | 'NONE';
  },
  logger?: DynamoDBLogger
): GetBuilder<KeyInput, Model> {
  const projection = options?.projection ?? [];
  const isConsistent = options?.consistentRead ?? false;
  const consumedCapacity = options?.returnConsumedCapacity;

  return {
    /**
     * Select only specific attributes to retrieve.
     */
    select(attrs) {
      return createGetBuilder(
        tableName,
        key,
        client,
        {
          projection: attrs,
          consistentRead: isConsistent,
          returnConsumedCapacity: consumedCapacity,
        },
        logger
      );
    },

    /**
     * Enable strongly consistent read.
     */
    consistentRead() {
      return createGetBuilder(
        tableName,
        key,
        client,
        {
          projection,
          consistentRead: true,
          returnConsumedCapacity: consumedCapacity,
        },
        logger
      );
    },

    /**
     * Configure ReturnConsumedCapacity parameter.
     */
    returnConsumedCapacity(mode) {
      return createGetBuilder(
        tableName,
        key,
        client,
        {
          projection,
          consistentRead: isConsistent,
          returnConsumedCapacity: mode,
        },
        logger
      );
    },

    /**
     * Build the underlying DynamoDB input parameters.
     */
    dbParams(): GetCommandInput {
      const params: GetCommandInput = {
        TableName: tableName,
        Key: key,
      };

      // Add projection with proper ExpressionAttributeNames
      if (projection.length > 0) {
        const projectionExpr = buildProjectionExpression(projection as string[]);
        params.ProjectionExpression = projectionExpr.ProjectionExpression;
        params.ExpressionAttributeNames = projectionExpr.ExpressionAttributeNames;
      }

      // Add consistent read if enabled
      if (isConsistent) {
        params.ConsistentRead = true;
      }

      // Add ReturnConsumedCapacity if specified
      if (consumedCapacity) {
        params.ReturnConsumedCapacity = consumedCapacity;
      }

      return params;
    },

    /**
     * Execute the GetItem command and return the item if found.
     */
    async execute(): Promise<Model | undefined> {
      const params = this.dbParams();
      const result: GetCommandOutput = await client.send(new GetCommand(params));
      logger?.log('GetCommand', params, result);
      return result.Item as unknown as Model | undefined;
    },
  };
}
