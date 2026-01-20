/**
 * Middleware hooks for builder execution
 */
export type ExecutionMiddleware<T = any> = {
  before?: () => void | Promise<void>;
  after?: (result: T) => T | Promise<T>;
};
