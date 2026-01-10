import { ExecutableBuilder, AttrBuilder, OpBuilder, Condition } from '../shared';

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
}
