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
function categorizeLoadError(error: unknown): string {
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
}

/**
 * Load all migration files from directory
 */
export class MigrationLoader {
  private migrationsDir: string;
  /**
   * Memoized result of `loadMigrations()`. Set on first successful load and
   * reused for the lifetime of the loader instance. The runner consults the
   * loader many times per command (per-version checksum check, per-rollback
   * lookup, status display) — without this, each call re-runs `readdirSync`,
   * re-imports every migration module, and re-md5s every file, turning an
   * O(N) operation into O(N²) in IO and require()s. Call `invalidateCache()`
   * if you need to pick up newly-added files mid-process.
   */
  private cachedMigrations: MigrationFile[] | null = null;

  constructor(migrationsDir: string) {
    this.migrationsDir = migrationsDir;
  }

  /**
   * Calculate checksum of a file
   */
  calculateChecksum(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Drop the in-memory cache so the next `loadMigrations()` call re-reads
   * the directory. Use after generating a new migration file mid-process.
   */
  invalidateCache(): void {
    this.cachedMigrations = null;
  }

  /**
   * Load all migration files
   */
  async loadMigrations(): Promise<MigrationFile[]> {
    if (this.cachedMigrations) {
      return this.cachedMigrations;
    }

    if (!fs.existsSync(this.migrationsDir)) {
      throw new Error(`Migrations directory not found: ${this.migrationsDir}`);
    }

    const files = fs
      .readdirSync(this.migrationsDir)
      .filter(
        (f) =>
          (f.endsWith('.ts') || f.endsWith('.js')) &&
          !f.endsWith('.d.ts') &&
          this.isValidMigrationFileName(f)
      )
      .sort((a, b) => {
        // Sort by semver
        const versionA = a.match(/^(\d+\.\d+\.\d+)/)?.[1] || '0.0.0';
        const versionB = b.match(/^(\d+\.\d+\.\d+)/)?.[1] || '0.0.0';
        return compareSemver(versionA, versionB);
      });

    const migrations: MigrationFile[] = [];

    for (const file of files) {
      const filePath = path.join(this.migrationsDir, file);
      const migration = await this.loadMigration(filePath);

      if (migration) {
        migrations.push(migration);
      }
    }

    this.cachedMigrations = migrations;
    return migrations;
  }

  /**
   * Load single migration file
   */
  private async loadMigration(filePath: string): Promise<MigrationFile | null> {
    // Convert to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    let module: any;

    // For TypeScript files, use require (ts-node must be registered)
    if (absolutePath.endsWith('.ts')) {
      // Register ts-node if not already registered
      this.registerTsNode();

      // Clear require cache to reload file
      delete require.cache[absolutePath];

      try {
        module = require(absolutePath);
      } catch (error: any) {
        throw new Error(
          `${categorizeLoadError(error)} loading TypeScript migration ${filePath}: ${error.message}`
        );
      }
    } else {
      // For JavaScript files, use dynamic import
      try {
        const fileUrl = `file://${absolutePath}`;
        module = await import(fileUrl);
      } catch (error: any) {
        throw new Error(
          `${categorizeLoadError(error)} loading JavaScript migration ${filePath}: ${error.message}`
        );
      }
    }

    const migration: Migration = module.migration || module.default;

    if (!migration) {
      console.warn(`Warning: No migration export found in ${filePath}`);
      return null;
    }

    // Validate migration structure
    this.validateMigration(migration, filePath);

    const fileName = path.basename(filePath);
    const { version, name } = this.parseMigrationFileName(fileName);

    // Calculate checksum
    const checksum = this.calculateChecksum(absolutePath);

    return {
      version,
      name,
      filePath,
      migration,
      checksum,
    };
  }

  /**
   * Register ts-node for TypeScript file loading.
   *
   * `ts-node` and `typescript` are declared as optional peerDependencies of
   * this package — consumers who only ever write `.js` migrations don't pay
   * the install cost. The lazy `require` here keeps the module out of the
   * runtime graph until a `.ts` migration is actually loaded, so JS-only
   * users never hit this path.
   */
  private registerTsNode(): void {
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
  }

  /**
   * Validate migration file name format
   * Expected: 1.0.0_migration_name.ts (semver format)
   */
  private isValidMigrationFileName(fileName: string): boolean {
    // Match semver: 1.0.0_name.ts or 1.2.3_name.ts
    return /^\d+\.\d+\.\d+_[\w-]+\.(ts|js)$/.test(fileName);
  }

  /**
   * Parse version and name from file name
   */
  private parseMigrationFileName(fileName: string): {
    version: string;
    name: string;
  } {
    const match = fileName.match(/^(\d+\.\d+\.\d+)_([\w-]+)\.(ts|js)$/);

    if (!match || !match[1] || !match[2]) {
      throw new Error(
        `Invalid migration file name format: ${fileName}. Expected: X.Y.Z_name.ts (semver)`
      );
    }

    const version = match[1];
    const name = match[2];

    return { version, name };
  }

  /**
   * Validate migration structure
   */
  private validateMigration(migration: Migration, filePath: string): void {
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
  }

  /**
   * Get pending migrations (not yet applied)
   */
  async getPendingMigrations(appliedVersions: string[]): Promise<MigrationFile[]> {
    const allMigrations = await this.loadMigrations();
    return allMigrations.filter((m) => !appliedVersions.includes(m.version));
  }

  /**
   * Get migration by version
   */
  async getMigration(version: string): Promise<MigrationFile | null> {
    const migrations = await this.loadMigrations();
    return migrations.find((m) => m.version === version) || null;
  }

  /**
   * Generate next version number (increments patch by default)
   */
  async getNextVersion(): Promise<string> {
    const migrations = await this.loadMigrations();

    if (migrations.length === 0) {
      return '0.1.0';
    }

    // Get last version
    const lastMigration = migrations[migrations.length - 1];
    if (!lastMigration) {
      return '0.1.0';
    }

    const lastVersion = lastMigration.version;

    // Parse semver and increment patch
    const parts = lastVersion.split('.');
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const major = parseInt(parts[0], 10);
      const minor = parseInt(parts[1], 10);
      const patch = parseInt(parts[2], 10);

      // Increment patch version
      return `${major}.${minor}.${patch + 1}`;
    }

    return '0.1.0';
  }

}
