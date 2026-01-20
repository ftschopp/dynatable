/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutionMiddleware } from './types';

/**
 * Applies middleware hooks to a builder's execute method
 */
export function withMiddleware<B extends { execute: () => Promise<any> }>(
  builder: B,
  middleware: ExecutionMiddleware
): B {
  const { before, after } = middleware;

  // If no middleware hooks provided, return builder as-is
  if (!before && !after) {
    return builder;
  }

  return {
    ...builder,
    execute: async () => {
      // Before execution hook
      if (before) {
        await before();
      }

      // Execute original builder
      const result = await builder.execute();

      // After execution hook
      if (after) {
        return await after(result);
      }

      return result;
    },
  };
}
