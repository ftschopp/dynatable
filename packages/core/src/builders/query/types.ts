/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutableBuilder, AttrBuilder, OpBuilder, Condition } from '../shared';

/**
 * Query result with pagination support
 */
export interface QueryResult<Model> {
  /**
   * The items returned by the query
   */
  items: Model[];

  /**
   * The LastEvaluatedKey for pagination (if more results available)
   */
  lastEvaluatedKey?: Record<string, any>;

  /**
   * Number of items examined before applying filters
   */
  count?: number;

  /**
   * Number of items returned after applying filters
   */
  scannedCount?: number;
}

/**
 * Query executor with additional query-specific options
 */
export interface QueryExecutor<Model> extends ExecutableBuilder<Model[]> {
  /**
   * Limit the number of items to return
   */
  limit(count: number): QueryExecutor<Model>;

  /**
   * Scan index forward (ascending) or backward (descending)
   */
  scanIndexForward(forward: boolean): QueryExecutor<Model>;

  /**
   * Use a secondary index
   */
  useIndex(indexName: string): QueryExecutor<Model>;

  /**
   * Select specific attributes to return
   */
  select(attrs: (keyof Model)[]): QueryExecutor<Model>;

  /**
   * Use consistent read
   */
  consistentRead(): QueryExecutor<Model>;

  /**
   * Start query from a specific key (for pagination)
   */
  startFrom(key: Record<string, any>): QueryExecutor<Model>;

  /**
   * Returns the raw DynamoDB query parameters
   */
  dbParams(): any;

  /**
   * Executes the query and returns matching items
   */
  execute(): Promise<Model[]>;

  /**
   * Executes the query and returns result with pagination metadata
   */
  executeWithPagination(): Promise<QueryResult<Model>>;
}

/**
 * Main Query Builder interface with type-safe where clause
 */
export interface QueryBuilder<Model> {
  /**
   * Build a condition expression using attributes and operators
   * Usage: .where((attr, op) => op.eq(attr.username, 'juanca'))
   * Usage: .where((attr, op) => op.and(
   *   op.eq(attr.username, 'juanca'),
   *   op.gt(attr.age, 18)
   * ))
   */
  where(fn: (attr: AttrBuilder<Model>, op: OpBuilder) => Condition): QueryExecutor<Model>;
}
