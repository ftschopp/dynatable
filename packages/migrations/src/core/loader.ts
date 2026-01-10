import * as fs from 'fs';
import * as path from 'path';
import { Migration, MigrationFile } from '../types';

/**
 * Load all migration files from directory
 */
export class MigrationLoader {
  private migrationsDir: string;

  constructor(migrationsDir: string) {
    this.migrationsDir = migrationsDir;
  }

  /**
   * Load all migration files
   */
  async loadMigrations(): Promise<MigrationFile[]> {
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
        return this.compareSemver(versionA, versionB);
      });

    const migrations: MigrationFile[] = [];

    for (const file of files) {
      const filePath = path.join(this.migrationsDir, file);
      const migration = await this.loadMigration(filePath);

      if (migration) {
        migrations.push(migration);
      }
    }

    return migrations;
  }

  /**
   * Load single migration file
   */
  private async loadMigration(filePath: string): Promise<MigrationFile | null> {
    try {
      // Convert to absolute path
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      let module: any;

      // For TypeScript files, use require (ts-node must be registered)
      if (absolutePath.endsWith('.ts')) {
        // Register ts-node if not already registered
        try {
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
        } catch {
          // ts-node might already be registered
        }

        // Clear require cache to reload file
        delete require.cache[absolutePath];

        module = require(absolutePath);
      } else {
        // For JavaScript files, use dynamic import
        const fileUrl = `file://${absolutePath}`;
        module = await import(fileUrl);
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

      return {
        version,
        name,
        filePath,
        migration,
      };
    } catch (error: any) {
      throw new Error(`Failed to load migration ${filePath}: ${error.message}`);
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

  /**
   * Compare semver versions
   * Returns: -1 if a < b, 0 if a === b, 1 if a > b
   */
  private compareSemver(a: string, b: string): number {
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
}
