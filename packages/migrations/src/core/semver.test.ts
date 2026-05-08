import { compareSemver } from './semver';

describe('compareSemver', () => {
  test('returns -1 when a < b across the minor digit boundary (the original bug)', () => {
    expect(compareSemver('0.9.0', '0.10.0')).toBe(-1);
  });

  test('returns 1 when a > b across the minor digit boundary', () => {
    expect(compareSemver('0.10.0', '0.9.0')).toBe(1);
  });

  test('returns -1 when a < b across the patch digit boundary', () => {
    expect(compareSemver('0.1.0', '0.1.10')).toBe(-1);
  });

  test('handles major beats minor', () => {
    expect(compareSemver('1.0.0', '0.99.99')).toBe(1);
  });

  test('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  test('sorts a list of versions ascending in the correct order', () => {
    const sorted = ['0.10.0', '1.0.0', '0.1.0', '0.9.0'].sort(compareSemver);
    expect(sorted).toEqual(['0.1.0', '0.9.0', '0.10.0', '1.0.0']);
  });

  test('sorts a list of versions descending when the comparator is inverted', () => {
    const sorted = ['0.10.0', '1.0.0', '0.1.0', '0.9.0'].sort((a, b) => compareSemver(b, a));
    expect(sorted).toEqual(['1.0.0', '0.10.0', '0.9.0', '0.1.0']);
  });
});
