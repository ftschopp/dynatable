/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared helpers for BatchGet / BatchWrite chunking + retry.
 *
 * DynamoDB caps batch operations at 100 items per BatchGetItem and 25 items
 * per BatchWriteItem, *across all tables combined*. The service can also
 * return UnprocessedItems / UnprocessedKeys when throttled or when the 16MB
 * response limit is hit. This module centralises the chunking, the
 * exponential-backoff retry, and the typed error so the two builders behave
 * the same way.
 */

export const BATCH_WRITE_LIMIT = 25;
export const BATCH_GET_LIMIT = 100;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_BACKOFF_MS = 50;

/**
 * Thrown when a BatchGet / BatchWrite still has unprocessed items / keys
 * after the configured number of retries.
 *
 * The `unprocessed` payload mirrors the shape DynamoDB itself uses for
 * `UnprocessedItems` / `UnprocessedKeys`, so the caller can re-issue the
 * request manually if they want.
 */
export class BatchUnprocessedError extends Error {
  public readonly unprocessed: Record<string, any>;

  constructor(message: string, unprocessed: Record<string, any>) {
    super(message);
    this.name = 'BatchUnprocessedError';
    this.unprocessed = unprocessed;
    // Preserve stack on V8.
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, BatchUnprocessedError);
    }
  }
}

/**
 * Splits a `(tableName -> items[])` map into chunks of at most `limit` items
 * total across all tables. Each chunk is itself a `(tableName -> items[])` map,
 * preserving the original per-table grouping.
 *
 * Items are emitted in iteration order: every item of the first table, then
 * the second, etc. The relative order within a table is preserved.
 */
export function chunkRequestItems<T>(
  requestItems: Record<string, T[]>,
  limit: number
): Record<string, T[]>[] {
  const flat: Array<{ tableName: string; item: T }> = [];
  for (const [tableName, items] of Object.entries(requestItems)) {
    for (const item of items) {
      flat.push({ tableName, item });
    }
  }
  if (flat.length === 0) return [];

  const chunks: Record<string, T[]>[] = [];
  for (let i = 0; i < flat.length; i += limit) {
    const slice = flat.slice(i, i + limit);
    const grouped: Record<string, T[]> = {};
    for (const { tableName, item } of slice) {
      if (!grouped[tableName]) grouped[tableName] = [];
      grouped[tableName]!.push(item);
    }
    chunks.push(grouped);
  }
  return chunks;
}

/**
 * Returns true when the SDK's UnprocessedItems / UnprocessedKeys map is
 * empty (either undefined, no keys, or every per-table array empty).
 */
export function isUnprocessedEmpty(unprocessed: Record<string, any> | undefined): boolean {
  if (!unprocessed) return true;
  const keys = Object.keys(unprocessed);
  if (keys.length === 0) return true;
  return keys.every((k) => {
    const v = unprocessed[k];
    if (Array.isArray(v)) return v.length === 0;
    if (v && Array.isArray(v.Keys)) return v.Keys.length === 0;
    return false;
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backoff for retry attempt N (0-indexed): `initial * 2^N` ms.
 */
export function backoffMs(attempt: number, initial: number): number {
  return initial * 2 ** attempt;
}
