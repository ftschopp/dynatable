/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MigrationLoader } from './loader';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dynatable-loader-test-'));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Write a `.js` migration file (no ts-node required) to `dir`. Returns the
 * absolute path. The body is a CommonJS module exporting `{ migration }`.
 */
function writeJsMigration(
  dir: string,
  fileName: string,
  body: string = `module.exports.migration = {
    version: '${(fileName.match(/^(\\d+\\.\\d+\\.\\d+)/) || [])[1] || '0.0.0'}',
    name: '${(fileName.match(/^\\d+\\.\\d+\\.\\d+_([\\w-]+)\\./) || [])[1] || 'unnamed'}',
    up: async () => {},
    down: async () => {},
  };`
): string {
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, body);
  return full;
}

describe('MigrationLoader.loadMigrations', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
  });
  afterEach(() => rmTmpDir(dir));

  test('throws when the migrations directory does not exist', async () => {
    const missing = path.join(dir, 'does-not-exist');
    const loader = new MigrationLoader(missing);
    await expect(loader.loadMigrations()).rejects.toThrow(/Migrations directory not found/);
  });

  test('returns [] for an empty migrations directory', async () => {
    const loader = new MigrationLoader(dir);
    await expect(loader.loadMigrations()).resolves.toEqual([]);
  });

  test('loads a well-formed .js migration', async () => {
    writeJsMigration(dir, '0.1.0_init.js');
    const loader = new MigrationLoader(dir);
    const migrations = await loader.loadMigrations();

    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatchObject({ version: '0.1.0', name: 'init' });
    expect(typeof migrations[0]!.checksum).toBe('string');
    expect(migrations[0]!.checksum!.length).toBeGreaterThan(0);
  });

  test('skips files whose names do not match X.Y.Z_name.(ts|js)', async () => {
    writeJsMigration(dir, '0.1.0_valid.js');
    fs.writeFileSync(path.join(dir, 'README.md'), '# nope');
    fs.writeFileSync(path.join(dir, '1_bad.js'), 'module.exports.migration = {};');
    fs.writeFileSync(path.join(dir, '0.1_also-bad.js'), 'module.exports.migration = {};');
    fs.writeFileSync(path.join(dir, 'mig.d.ts'), 'export {};');

    const loader = new MigrationLoader(dir);
    const migrations = await loader.loadMigrations();

    expect(migrations.map((m) => m.name)).toEqual(['valid']);
  });

  test('orders migrations by semver — `0.10.0` follows `0.9.0` (not `0.1.0` order)', async () => {
    // Note: `compareSemver` is the contract here. Lexicographic sort would
    // place 0.10.0 BEFORE 0.9.0 — this guards against that regression.
    writeJsMigration(dir, '0.10.0_tenth.js');
    writeJsMigration(dir, '0.9.0_ninth.js');
    writeJsMigration(dir, '0.1.0_first.js');

    const loader = new MigrationLoader(dir);
    const versions = (await loader.loadMigrations()).map((m) => m.version);

    expect(versions).toEqual(['0.1.0', '0.9.0', '0.10.0']);
  });

  test('rejects a migration that is missing the up() function', async () => {
    writeJsMigration(
      dir,
      '0.1.0_no-up.js',
      `module.exports.migration = {
        version: '0.1.0',
        name: 'no-up',
        down: async () => {},
      };`
    );

    const loader = new MigrationLoader(dir);
    await expect(loader.loadMigrations()).rejects.toThrow(/missing 'up'/);
  });

  test('rejects a migration that is missing the down() function', async () => {
    writeJsMigration(
      dir,
      '0.1.0_no-down.js',
      `module.exports.migration = {
        version: '0.1.0',
        name: 'no-down',
        up: async () => {},
      };`
    );

    const loader = new MigrationLoader(dir);
    await expect(loader.loadMigrations()).rejects.toThrow(/missing 'down'/);
  });

  test('rejects a migration where up is not a function', async () => {
    writeJsMigration(
      dir,
      '0.1.0_bad-up.js',
      `module.exports.migration = {
        version: '0.1.0',
        name: 'bad-up',
        up: 'not a function',
        down: async () => {},
      };`
    );

    const loader = new MigrationLoader(dir);
    await expect(loader.loadMigrations()).rejects.toThrow(/'up'.*function/);
  });

  test('rejects when version is missing on the migration export', async () => {
    writeJsMigration(
      dir,
      '0.1.0_no-version.js',
      `module.exports.migration = {
        name: 'no-version',
        up: async () => {},
        down: async () => {},
      };`
    );

    const loader = new MigrationLoader(dir);
    await expect(loader.loadMigrations()).rejects.toThrow(/'version'/);
  });

});

describe('MigrationLoader.calculateChecksum', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
  });
  afterEach(() => rmTmpDir(dir));

  test('produces a different checksum when the file content changes', async () => {
    const filePath = writeJsMigration(dir, '0.1.0_init.js');
    const loader = new MigrationLoader(dir);
    const before = loader.calculateChecksum(filePath);

    fs.writeFileSync(filePath, fs.readFileSync(filePath, 'utf-8') + '\n// extra comment\n');
    const after = loader.calculateChecksum(filePath);

    expect(before).not.toBe(after);
  });

  test('is stable across calls when content does not change', () => {
    const filePath = writeJsMigration(dir, '0.1.0_init.js');
    const loader = new MigrationLoader(dir);
    expect(loader.calculateChecksum(filePath)).toBe(loader.calculateChecksum(filePath));
  });
});

describe('MigrationLoader.getPendingMigrations', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
  });
  afterEach(() => rmTmpDir(dir));

  test('returns only migrations whose version is not in `appliedVersions`', async () => {
    writeJsMigration(dir, '0.1.0_one.js');
    writeJsMigration(dir, '0.2.0_two.js');
    writeJsMigration(dir, '0.3.0_three.js');

    const loader = new MigrationLoader(dir);
    const pending = await loader.getPendingMigrations(['0.1.0']);

    expect(pending.map((m) => m.version)).toEqual(['0.2.0', '0.3.0']);
  });
});

describe('MigrationLoader.getNextVersion', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
  });
  afterEach(() => rmTmpDir(dir));

  test('returns 0.1.0 when there are no migrations', async () => {
    const loader = new MigrationLoader(dir);
    expect(await loader.getNextVersion()).toBe('0.1.0');
  });

  test('increments the patch version of the latest migration (semver-ordered)', async () => {
    writeJsMigration(dir, '0.9.0_old.js');
    writeJsMigration(dir, '0.10.0_newer.js');
    writeJsMigration(dir, '0.10.5_newest.js');

    const loader = new MigrationLoader(dir);
    expect(await loader.getNextVersion()).toBe('0.10.6');
  });
});
