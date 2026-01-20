import { stripInternalKeys } from '@/utils/model-utils';
import { ExecutionMiddleware } from './types';

/**
 * Creates middleware configuration for cleaning internal keys
 */
export function createCleanKeysMiddleware(shouldClean: boolean): ExecutionMiddleware {
  if (!shouldClean) {
    return {};
  }

  return {
    after: (result) => stripInternalKeys(result),
  };
}
