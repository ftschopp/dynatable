import * as fs from 'fs';
import * as path from 'path';
import { MigrationConfig } from '../types';

const CONFIG_FILE_NAMES = [
  'dynatable.config.js',
  'dynatable.config.json',
  '.dynatablerc.js',
  '.dynatablerc.json',
];

const findConfigFile = (): string | null => {
  const root = path.parse(process.cwd()).root;
  const climb = (dir: string): string | null => {
    if (dir === root) return null;
    const match = CONFIG_FILE_NAMES.map((n) => path.join(dir, n)).find((p) =>
      fs.existsSync(p)
    );
    return match ?? climb(path.dirname(dir));
  };
  return climb(process.cwd());
};

const validateAndNormalizeConfig = (config: Partial<MigrationConfig>): MigrationConfig => {
  if (!config.tableName) {
    throw new Error("Configuration error: 'tableName' is required");
  }

  // DynamoDB table-name rules: 3-255 chars, alphanumeric plus . _ -.
  // Cheapest place to catch typos before the SDK rejects the request.
  if (!/^[a-zA-Z0-9._-]{3,255}$/.test(config.tableName)) {
    throw new Error(
      `Configuration error: 'tableName' must be 3-255 characters and contain only ` +
        `letters, numbers, '.', '_', or '-' (got: ${JSON.stringify(config.tableName)})`
    );
  }

  if (!config.client?.region) {
    throw new Error("Configuration error: 'client.region' is required");
  }

  const migrationsDir = config.migrationsDir || './migrations';
  // We don't auto-create the directory here — `dynatable-migrate init`
  // and `create` both handle that. But if the user explicitly pointed
  // at something that exists and isn't a directory, fail loudly.
  if (fs.existsSync(migrationsDir) && !fs.statSync(migrationsDir).isDirectory()) {
    throw new Error(
      `Configuration error: 'migrationsDir' (${migrationsDir}) exists but is not a directory.`
    );
  }

  return {
    tableName: config.tableName,
    client: {
      region: config.client.region,
      endpoint: config.client.endpoint,
      credentials: config.client.credentials,
    },
    migrationsDir,
    trackingPrefix: config.trackingPrefix || '_SCHEMA#VERSION',
    gsi1Name: config.gsi1Name || 'GSI1',
  };
};

/**
 * Get config from environment or file
 */
export async function loadConfig(configPath?: string): Promise<MigrationConfig> {
  const resolved = configPath || findConfigFile() || 'dynatable.config.js';

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Configuration file not found: ${resolved}\n\nPlease create a dynatable.config.js file in your project root.`
    );
  }

  try {
    const config: MigrationConfig = resolved.endsWith('.json')
      ? JSON.parse(fs.readFileSync(resolved, 'utf-8'))
      : await import(resolved).then((m) => m.default || m);

    return validateAndNormalizeConfig(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load configuration: ${message}`);
  }
}

/**
 * Create default config file in the given path.
 */
export const createDefaultConfig = (targetPath: string): void => {
  const defaultConfig = `module.exports = {
  // DynamoDB table name
  tableName: "MyTable",

  // DynamoDB client configuration
  client: {
    region: "us-east-1",

    // Optional: For local DynamoDB
    endpoint: "http://localhost:8000",

    // Optional: Credentials (use AWS_PROFILE or IAM role in production)
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  },

  // Optional: Migrations directory (default: ./migrations)
  migrationsDir: "./migrations",

  // Optional: Tracking prefix in single table (default: _SCHEMA#VERSION)
  trackingPrefix: "_SCHEMA#VERSION",

  // Optional: GSI name for tracking (default: GSI1)
  gsi1Name: "GSI1",
};
`;

  fs.writeFileSync(targetPath, defaultConfig, 'utf-8');
  console.log(`✅ Created config file: ${targetPath}`);
};
