import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Migration, MigrationFile } from '../types';
import { compareSemver } from './semver';

/**
 * Map a require/import failure to a human-readable category. The same
 * thrown error covers wildly different operator-facing problems —
 * "your file has a syntax error", "you forgot to install a dep", "the
 * code ran on import and threw" — and prefixing the message with the
 * category cuts triage time significantly.
 */
const categorizeLoadError = (error: unknown): string => {
  const e = error as { code?: string; name?: string; message?: string } | null;
  const code = e?.code;
  const name = e?.name;
  const msg = e?.message ?? '';
  if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
    return 'Missing dependency';
  }
  if (name === 'SyntaxError' || /SyntaxError|TS\d{4}|ts-node/i.test(msg)) {
    return 'Syntax error';
  }
  return 'Runtime error';
};

/**
 * Calculate checksum of a file
 */
export const calculateChecksum = (filePath: string): string => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('md5').update(content).digest('hex');
};

/**
 * Register ts-node for TypeScript file loading.
 *
 * `ts-node` and `typescript` are declared as optional peerDependencies of
 * this package — consumers who only ever write `.js` migrations don't pay
 * the install cost. The lazy `require` here keeps the module out of the
 * runtime graph until a `.ts` migration is actually loaded, so JS-only
 * users never hit this path.
 */
const registerTsNode = (): void => {
  try {
    // Check if ts-node is already registered
    const tsNodeSymbol = Symbol.for('ts-node.register.instance');
    if ((process as any)[tsNodeSymbol]) {
      return; // Already registered
    }

    require('ts-node').register({
      transpileOnly: true,
      skipProject: true, // Don't use project tsconfig
      compilerOptions: {
        module: 'commonjs',
        target: 'ES2020',
        esModuleInterop: true,
        moduleResolution: 'node',
      },
    });
  } catch (error: any) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'ts-node is required to load TypeScript migrations but is not installed. ' +
          'Install it as a dev dependency:\n' +
          '  npm install --save-dev ts-node typescript\n' +
          '  # or\n' +
          '  yarn add --dev ts-node typescript\n' +
          'If your migrations are JavaScript only, rename them from .ts to .js.'
      );
    }
    // Other errors might mean ts-node is already registered differently
    console.warn(`Warning: Could not register ts-node: ${error.message}`);
  }
};

/**
 * Validate migration file name format
 * Expected: 1.0.0_migration_name.ts (semver format)
 */
const isValidMigrationFileName = (fileName: string): boolean =>
  /^\d+\.\d+\.\d+_[\w-]+\.(ts|js)$/.test(fileName);

/**
 * Parse version and name from file name
 */
const parseMigrationFileName = (fileName: string): { version: string; name: string } => {
  const match = fileName.match(/^(\d+\.\d+\.\d+)_([\w-]+)\.(ts|js)$/);

  if (!match || !match[1] || !match[2]) {
    throw new Error(
      `Invalid migration file name format: ${fileName}. Expected: X.Y.Z_name.ts (semver)`
    );
  }

  return { version: match[1], name: match[2] };
};

/**
 * Validate migration structure
 */
const validateMigration = (migration: Migration, filePath: string): void => {
  if (!migration.version) {
    throw new Error(`Migration ${filePath} is missing 'version' property`);
  }
  if (!migration.name) {
    throw new Error(`Migration ${filePath} is missing 'name' property`);
  }
  if (typeof migration.up !== 'function') {
    throw new Error(`Migration ${filePath} is missing 'up' function or it's not a function`);
  }
  if (typeof migration.down !== 'function') {
    throw new Error(`Migration ${filePath} is missing 'down' function or it's not a function`);
  }
};

const loadMigration = async (filePath: string): Promise<MigrationFile | null> => {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const module = await (absolutePath.endsWith('.ts')
    ? (async () => {
        registerTsNode();
        // Clear require cache to reload file
        delete require.cache[absolutePath];
        try {
          return require(absolutePath);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            `${categorizeLoadError(error)} loading TypeScript migration ${filePath}: ${message}`
          );
        }
      })()
    : (async () => {
        try {
          return await import(`file://${absolutePath}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            `${categorizeLoadError(error)} loading JavaScript migration ${filePath}: ${message}`
          );
        }
      })());

  const migration: Migration = module.migration || module.default;

  if (!migration) {
    console.warn(`Warning: No migration export found in ${filePath}`);
    return null;
  }

  validateMigration(migration, filePath);

  const fileName = path.basename(filePath);
  const { version, name } = parseMigrationFileName(fileName);
  const checksum = calculateChecksum(absolutePath);

  return { version, name, filePath, migration, checksum };
};

export interface MigrationLoaderHandle {
  loadMigrations(): Promise<MigrationFile[]>;
  invalidateCache(): void;
  getPendingMigrations(appliedVersions: string[]): Promise<MigrationFile[]>;
  getMigration(version: string): Promise<MigrationFile | null>;
  getNextVersion(): Promise<string>;
  calculateChecksum(filePath: string): string;
}

/**
 * Create a migration loader for the given directory.
 *
 * Internally memoizes `loadMigrations()` — the runner consults the loader
 * many times per command (per-version checksum check, per-rollback
 * lookup, status display) — without this, each call re-runs `readdirSync`,
 * re-imports every migration module, and re-md5s every file, turning an
 * O(N) operation into O(N²) in IO and require()s. Call `invalidateCache()`
 * if you need to pick up newly-added files mid-process.
 */
export const createMigrationLoader = (migrationsDir: string): MigrationLoaderHandle => {
  let cachedMigrations: MigrationFile[] | null = null;

  const loadMigrations = async (): Promise<MigrationFile[]> => {
    if (cachedMigrations) return cachedMigrations;

    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter(
        (f) =>
          (f.endsWith('.ts') || f.endsWith('.js')) &&
          !f.endsWith('.d.ts') &&
          isValidMigrationFileName(f)
      )
      .sort((a, b) => {
        const versionA = a.match(/^(\d+\.\d+\.\d+)/)?.[1] || '0.0.0';
        const versionB = b.match(/^(\d+\.\d+\.\d+)/)?.[1] || '0.0.0';
        return compareSemver(versionA, versionB);
      });

    const loaded = await Promise.all(
      files.map((f) => loadMigration(path.join(migrationsDir, f)))
    );
    cachedMigrations = loaded.filter((m): m is MigrationFile => m !== null);
    return cachedMigrations;
  };

  return {
    loadMigrations,
    invalidateCache: () => {
      cachedMigrations = null;
    },
    calculateChecksum,
    getPendingMigrations: async (appliedVersions) => {
      const all = await loadMigrations();
      return all.filter((m) => !appliedVersions.includes(m.version));
    },
    getMigration: async (version) => {
      const all = await loadMigrations();
      return all.find((m) => m.version === version) ?? null;
    },
    getNextVersion: async () => {
      const migrations = await loadMigrations();
      const last = migrations[migrations.length - 1];
      if (!last) return '0.1.0';

      const parts = last.version.split('.');
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const [major, minor, patch] = parts.map((p) => parseInt(p, 10));
        return `${major}.${minor}.${patch! + 1}`;
      }
      return '0.1.0';
    },
  };
};
