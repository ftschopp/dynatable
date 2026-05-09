import * as fs from 'fs';
import * as path from 'path';
import { MigrationConfig } from '../types';

/**
 * Load migration configuration
 */
export class ConfigLoader {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || this.findConfigFile() || 'dynatable.config.js';
  }

  /**
   * Find config file in current directory or parent directories
   */
  private findConfigFile(): string | null {
    const configFileNames = [
      'dynatable.config.js',
      'dynatable.config.json',
      '.dynatablerc.js',
      '.dynatablerc.json',
    ];

    let currentDir = process.cwd();
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      for (const fileName of configFileNames) {
        const filePath = path.join(currentDir, fileName);
        if (fs.existsSync(filePath)) {
          return filePath;
        }
      }

      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<MigrationConfig> {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(
        `Configuration file not found: ${this.configPath}\n\nPlease create a dynatable.config.js file in your project root.`
      );
    }

    try {
      let config: MigrationConfig;

      if (this.configPath.endsWith('.json')) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        config = JSON.parse(content);
      } else {
        // JavaScript config file
        const module = await import(this.configPath);
        config = module.default || module;
      }

      return this.validateAndNormalizeConfig(config);
    } catch (error: any) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Validate and normalize configuration
   */
  private validateAndNormalizeConfig(config: Partial<MigrationConfig>): MigrationConfig {
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
  }

  /**
   * Create default config file
   */
  static createDefaultConfig(targetPath: string): void {
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
  }
}

/**
 * Get config from environment or file
 */
export async function loadConfig(configPath?: string): Promise<MigrationConfig> {
  const loader = new ConfigLoader(configPath);
  return loader.load();
}
