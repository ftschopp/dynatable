/**
 * Compare two semver versions of the form `MAJOR.MINOR.PATCH`.
 *
 * Returns:
 *   -1 if `a < b`
 *    0 if `a === b`
 *    1 if `a > b`
 *
 * Designed for migration filenames (`0.1.0_name.ts`) which the loader
 * already validates as strict three-segment semver — prerelease and build
 * metadata are not handled.
 */
export function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10));
  const partsB = b.split('.').map((n) => parseInt(n, 10));

  for (let i = 0; i < 3; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}
