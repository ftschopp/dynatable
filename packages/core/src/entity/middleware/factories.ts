import { stripInternalKeys } from '@/utils/model-utils';
import { ExecutionMiddleware } from './types';

/**
 * Creates middleware configuration for cleaning internal keys.
 *
 * @param shouldClean - When false, returns a no-op middleware.
 * @param internalKeys - Optional schema-derived list of column names to
 *   strip. Falls back to the default `['PK', 'SK', '_type']` when omitted,
 *   which is only correct for schemas that follow the conventional naming
 *   AND have no secondary indexes whose columns leak into returned items.
 */
export function createCleanKeysMiddleware(
  shouldClean: boolean,
  internalKeys?: readonly string[]
): ExecutionMiddleware {
  if (!shouldClean) {
    return {};
  }

  return {
    after: (result) => stripInternalKeys(result, internalKeys),
  };
}
