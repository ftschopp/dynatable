import * as fs from 'fs';
import * as path from 'path';
import { MigrationLoader } from '../core/loader';
import { generateMigrationTemplate } from '../templates/migration';

type VersionBumpType = 'major' | 'minor' | 'patch';

/**
 * Get next version based on bump type
 */
async function getNextVersion(loader: MigrationLoader, bumpType: VersionBumpType): Promise<string> {
  const migrations = await loader['loadMigrations']();

  if (migrations.length === 0) {
    return '0.1.0';
  }

  const lastMigration = migrations[migrations.length - 1];
  if (!lastMigration) {
    return '0.1.0';
  }

  const lastVersion = lastMigration.version;
  const parts = lastVersion.split('.');

  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return '0.1.0';
  }

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);

  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

export async function createMigration(
  name: string,
  migrationsDir: string = './migrations',
  bumpType?: string,
  explicitVersion?: string
): Promise<void> {
  // Ensure migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    console.log(`📁 Created migrations directory: ${migrationsDir}`);
  }

  // Generate version
  const loader = new MigrationLoader(migrationsDir);
  let version: string;

  if (explicitVersion) {
    // Validate explicit version is semver
    if (!/^\d+\.\d+\.\d+$/.test(explicitVersion)) {
      throw new Error(
        `Invalid version format: ${explicitVersion}. Expected semver format (e.g., 1.0.0)`
      );
    }
    version = explicitVersion;
  } else if (bumpType) {
    // Validate bump type
    const validTypes: VersionBumpType[] = ['major', 'minor', 'patch'];
    if (!validTypes.includes(bumpType as VersionBumpType)) {
      throw new Error(`Invalid bump type: ${bumpType}. Expected: major, minor, or patch`);
    }
    version = await getNextVersion(loader, bumpType as VersionBumpType);
  } else {
    // Default: increment patch
    version = await getNextVersion(loader, 'patch');
  }

  // Sanitize name (replace spaces and special chars with underscores)
  const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

  // Generate file name
  const fileName = `${version}_${sanitizedName}.ts`;
  const filePath = path.join(migrationsDir, fileName);

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    throw new Error(`Migration file already exists: ${filePath}`);
  }

  // Generate migration content
  const content = generateMigrationTemplate(version, sanitizedName);

  // Write file
  fs.writeFileSync(filePath, content, 'utf-8');

  // Determine version type for informational message
  const versionType = bumpType ? bumpType.toUpperCase() : explicitVersion ? 'EXPLICIT' : 'PATCH';

  console.log(`\n✅ Created migration: ${fileName}`);
  console.log(`   Path: ${filePath}`);
  console.log(`   Version: ${version} (${versionType})\n`);
  console.log(`Next steps:`);
  console.log(`  1. Edit ${fileName}`);
  console.log(`  2. Implement up() and down() functions`);
  console.log(`  3. Run: dynatable-migrate up\n`);
}
