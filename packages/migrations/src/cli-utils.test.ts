import { parsePositiveInt } from './cli-utils';

describe('parsePositiveInt', () => {
  const parser = parsePositiveInt('limit');

  test('accepts positive integers', () => {
    expect(parser('1')).toBe(1);
    expect(parser('42')).toBe(42);
    expect(parser('1000')).toBe(1000);
  });

  test('trims surrounding whitespace before parsing', () => {
    expect(parser('  5  ')).toBe(5);
  });

  test('rejects 0', () => {
    expect(() => parser('0')).toThrow(/--limit must be a positive integer/);
  });

  test('rejects negative numbers', () => {
    expect(() => parser('-5')).toThrow(/--limit must be a positive integer/);
  });

  test('rejects non-numeric input', () => {
    expect(() => parser('abc')).toThrow(/--limit must be a positive integer/);
  });

  test('rejects floats (1.5 would parseInt to 1, but the trailing decimals are still wrong)', () => {
    expect(() => parser('1.5')).toThrow(/--limit must be a positive integer/);
  });

  test('rejects empty string', () => {
    expect(() => parser('')).toThrow(/--limit must be a positive integer/);
  });

  test('rejects strings with trailing junk that parseInt would silently swallow', () => {
    // parseInt('5abc', 10) === 5, but we should refuse it because the input
    // is clearly not a positive integer.
    expect(() => parser('5abc')).toThrow(/--limit must be a positive integer/);
  });

  test('error mentions the flag name passed to the factory', () => {
    expect(() => parsePositiveInt('steps')('-1')).toThrow(/--steps/);
  });
});
