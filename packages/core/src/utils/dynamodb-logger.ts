/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Configuration for DynamoDB operation logging
 */
export interface DynamoDBLoggerConfig {
  /**
   * Enable/disable logging. Default: false
   */
  enabled: boolean;

  /**
   * Log the request parameters. Default: true
   */
  logParams?: boolean;

  /**
   * Log the response data. Default: false
   */
  logResponse?: boolean;

  /**
   * Custom logger function. Default: console.log
   */
  loggerFn?: (message: string) => void;
}

/**
 * DynamoDB Logger interface
 */
export type DynamoDBLogger = {
  /**
   * Log a DynamoDB operation with its parameters and optionally the response
   */
  log: <TParams, TResponse>(operationName: string, params: TParams, response?: TResponse) => void;
};

/**
 * Pure function to format log message
 * This function has no side effects and is easily testable
 */
const formatLogMessage = <TParams, TResponse>(
  operationName: string,
  timestamp: string,
  params: TParams,
  response: TResponse | undefined,
  config: DynamoDBLoggerConfig
): string => {
  const parts: string[] = [
    '\n' + '='.repeat(80),
    `[DynamoDB] ${operationName} - ${timestamp}`,
    '='.repeat(80),
  ];

  if (config.logParams && params) {
    parts.push('\n📤 Request Parameters:');
    parts.push(JSON.stringify(params, null, 2));
  }

  if (config.logResponse && response) {
    parts.push('\n📥 Response:');
    parts.push(JSON.stringify(response, null, 2));
  }

  parts.push('='.repeat(80) + '\n');

  return parts.join('\n');
};

/**
 * Creates a DynamoDB logger instance with the given configuration
 * This is the main factory function for creating loggers
 *
 * @example Basic logger with request parameters only
 * ```typescript
 * const logger = createDynamoDBLogger({
 *   enabled: true,
 *   logParams: true,
 *   logResponse: false,
 * });
 * ```
 *
 * @example Full logging (params + response)
 * ```typescript
 * const logger = createDynamoDBLogger({
 *   enabled: true,
 *   logParams: true,
 *   logResponse: true,
 * });
 * ```
 *
 * @example Using with a table
 * ```typescript
 * const logger = createDynamoDBLogger({
 *   enabled: true,
 *   logParams: true,
 *   logResponse: true,
 * });
 *
 * const userTable = createTable({
 *   tableName: 'Users',
 *   client: dynamoDBClient,
 *   schema: userSchema,
 *   logger, // Pass logger to table
 * });
 *
 * // Operations will be logged automatically
 * const user = await userTable.get({ username: 'johndoe' }).execute();
 * ```
 *
 * @example Custom logger function (Winston, Pino, etc.)
 * ```typescript
 * import winston from 'winston';
 *
 * const winstonLogger = winston.createLogger({
 *   level: 'info',
 *   format: winston.format.json(),
 *   transports: [new winston.transports.Console()],
 * });
 *
 * const logger = createDynamoDBLogger({
 *   enabled: true,
 *   logParams: true,
 *   logResponse: true,
 *   loggerFn: (message) => winstonLogger.info(message),
 * });
 * ```
 *
 * @example Output format
 * ```
 * ================================================================================
 * [DynamoDB] GetCommand - 2025-12-29T10:30:45.123Z
 * ================================================================================
 *
 * 📤 Request Parameters:
 * {
 *   "TableName": "Users",
 *   "Key": {
 *     "PK": "USER#johndoe",
 *     "SK": "PROFILE"
 *   }
 * }
 *
 * 📥 Response:
 * {
 *   "Item": {
 *     "PK": "USER#johndoe",
 *     "SK": "PROFILE",
 *     "username": "johndoe",
 *     "email": "john@example.com"
 *   }
 * }
 * ================================================================================
 * ```
 */
export const createDynamoDBLogger = (config: DynamoDBLoggerConfig): DynamoDBLogger => {
  const logFn = config.loggerFn || console.log;

  return {
    log: <TParams, TResponse>(
      operationName: string,
      params: TParams,
      response?: TResponse
    ): void => {
      if (!config.enabled) {
        return;
      }

      const timestamp = new Date().toISOString();
      const message = formatLogMessage(operationName, timestamp, params, response, config);

      logFn(message);
    },
  };
};
