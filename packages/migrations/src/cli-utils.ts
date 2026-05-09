import { InvalidArgumentError } from 'commander';

/**
 * Commander value parser that accepts only positive integers. Used for
 * `--limit` and `--steps` so `0`, negative numbers, and non-numeric input
 * fail at parse time with a clean usage error instead of silently feeding
 * `Array.prototype.slice` and producing surprising rollbacks.
 */
export function parsePositiveInt(name: string): (raw: string) => number {
  return (raw: string) => {
    const trimmed = raw.trim();
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(n) || n <= 0 || String(n) !== trimmed) {
      throw new InvalidArgumentError(`--${name} must be a positive integer (got "${raw}").`);
    }
    return n;
  };
}
