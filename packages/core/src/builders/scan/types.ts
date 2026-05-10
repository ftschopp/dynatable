/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutableBuilder, AttrBuilder, OpBuilder, Condition } from '../shared';

/**
 * A single page of scan results plus metadata for manual pagination.
 */
export interface ScanResult<Model> {
  /** Items returned in this page. */
  items: Model[];
  /** Cursor for the next page; `undefined` when there are no more results. */
  lastEvaluatedKey?: Record<string, any>;
  /** Number of items returned after applying the filter. */
  count?: number;
  /** Number of items examined before applying the filter. */
  scannedCount?: number;
}

/**
 * Builder for DynamoDB Scan operations.
 * Scans the entire table or index without requiring key conditions.
 */
export interface ScanBuilder<Model> extends ExecutableBuilder<Model[]> {
  /**
   * Adds a filter expression to the scan.
   * Returns a new immutable builder.
   */
  filter(fn: (attr: AttrBuilder<Model>, op: OpBuilder) => Condition): ScanBuilder<Model>;

  /**
   * Adds a projection expression to only return specific attributes.
   * Returns a new immutable builder.
   */
  select(attrs: (keyof Model)[]): ScanBuilder<Model>;

  /**
   * Sets the maximum number of items to evaluate (not necessarily return).
   * Returns a new immutable builder.
   */
  limit(count: number): ScanBuilder<Model>;

  /**
   * Enables consistent read (eventual consistency is default).
   * Returns a new immutable builder.
   */
  consistentRead(): ScanBuilder<Model>;

  /**
   * Specifies an index to scan.
   * Returns a new immutable builder.
   */
  usingIndex(indexName: string): ScanBuilder<Model>;

  /**
   * Sets the starting position for the scan (pagination).
   * Returns a new immutable builder.
   */
  startFrom(exclusiveStartKey: Record<string, any>): ScanBuilder<Model>;

  /**
   * Enables parallel scan by specifying segment and total segments.
   * Returns a new immutable builder.
   */
  segment(segmentNumber: number, totalSegments: number): ScanBuilder<Model>;

  /**
   * Configures the ReturnConsumedCapacity parameter so DynamoDB reports
   * how many RCUs the scan consumed. Useful for diagnosing throttling
   * and confirming filter selectivity.
   *
   * - INDEXES: Returns consumed capacity for table and indexes
   * - TOTAL: Returns total consumed capacity
   * - NONE: No consumed capacity data returned (default)
   */
  returnConsumedCapacity(mode: 'INDEXES' | 'TOTAL' | 'NONE'): ScanBuilder<Model>;

  /**
   * Executes a single Scan request and returns the page along with the
   * `lastEvaluatedKey` cursor and counts. Use this when you want to drive
   * pagination yourself (e.g. expose a cursor to a client).
   */
  executeWithPagination(): Promise<ScanResult<Model>>;

  /**
   * Returns an async iterator that paginates internally and yields one item at
   * a time. Memory stays at one page; you can `break` out of the loop early.
   *
   * `Limit` set via `.limit()` is forwarded to DynamoDB as a *per-request*
   * cap, not a total cap. To cap the total, count yourself inside the loop:
   *
   * ```ts
   * let n = 0;
   * for await (const item of builder.iterate()) {
   *   if (n++ >= 1000) break;
   *   process(item);
   * }
   * ```
   */
  iterate(): AsyncIterableIterator<Model>;
}
