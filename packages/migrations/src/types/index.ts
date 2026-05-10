import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  ScanCommand,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  TransactGetCommand,
} from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB commands available in migrations
 */
export interface DynamoDBCommands {
  ScanCommand: typeof ScanCommand;
  QueryCommand: typeof QueryCommand;
  GetCommand: typeof GetCommand;
  PutCommand: typeof PutCommand;
  UpdateCommand: typeof UpdateCommand;
  DeleteCommand: typeof DeleteCommand;
  BatchGetCommand: typeof BatchGetCommand;
  BatchWriteCommand: typeof BatchWriteCommand;
  TransactWriteCommand: typeof TransactWriteCommand;
  TransactGetCommand: typeof TransactGetCommand;
}

/**
 * Migration context provided to up/down functions
 */
export interface MigrationContext {
  client: DynamoDBDocumentClient;
  tableName: string;
  tracker: MigrationTracker;
  config: MigrationConfig;
  dynamodb: DynamoDBCommands;
}

/**
 * Schema change record for tracking evolution
 */
export interface SchemaChange {
  entity: string;
  changes: {
    added?: string[];
    removed?: string[];
    modified?: Array<{
      field: string;
      from: any;
      to: any;
    }>;
  };
}

/**
 * Migration definition
 */
export interface Migration {
  version: string;
  name: string;
  description?: string;

  // Optional schema snapshot for documentation
  schema?: Record<string, any>;

  // Migration functions
  up: (context: MigrationContext) => Promise<void>;
  down: (context: MigrationContext) => Promise<void>;
}

/**
 * Migration record stored in DynamoDB
 */
export interface MigrationRecord {
  PK: string; // "SCHEMA#VERSION"
  SK: string; // "v0001"
  version: string;
  name: string;
  description?: string;
  timestamp: string;
  appliedAt: string;
  status: 'applied' | 'rolled_back' | 'failed';
  schemaDefinition?: Record<string, any>;
  schemaChanges?: SchemaChange[];
  checksum?: string; // Hash of migration file
  error?: string; // Error message if failed
}

/**
 * Current schema pointer record
 */
export interface CurrentSchemaRecord {
  GSI1PK: string; // "SCHEMA#CURRENT"
  GSI1SK: string; // Current version
  PK: string;
  SK: string;
  currentVersion: string;
  updatedAt: string;
}

/**
 * Migration configuration
 */
export interface MigrationConfig {
  tableName: string;
  client: {
    endpoint?: string;
    region: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
  migrationsDir?: string;
  trackingPrefix?: string; // Default: "_SCHEMA#VERSION"
  gsi1Name?: string; // Default: "GSI1"
  /**
   * How long an acquired migration lock stays valid before another worker
   * can take it over, in seconds. The runner sends a heartbeat every
   * `lockTtlSeconds / 3` to extend it. Default: 300 (5 minutes).
   */
  lockTtlSeconds?: number;
}

/**
 * Migration tracker interface
 */
export interface MigrationTracker {
  /**
   * Initialize migration tracking table/items if needed
   */
  initialize(): Promise<void>;

  /**
   * Get all applied migrations
   */
  getAppliedMigrations(): Promise<MigrationRecord[]>;

  /**
   * Get current schema version
   */
  getCurrentVersion(): Promise<string | null>;

  /**
   * Acquire a distributed lock
   */
  acquireLock(): Promise<boolean>;

  /**
   * Release the distributed lock
   */
  releaseLock(): Promise<void>;

  /**
   * Extend the lock's expiration. Throws `ConditionalCheckFailedException`
   * if the lock has already been taken by someone else.
   */
  refreshLock(): Promise<void>;

  /**
   * Mark migration as applied
   */
  markAsApplied(
    version: string,
    name: string,
    schemaDefinition?: Record<string, any>,
    schemaChanges?: SchemaChange[],
    checksum?: string
  ): Promise<void>;

  /**
   * Mark migration as rolled back.
   *
   * `previousVersion` is an optional perf hint: if the caller already knows
   * the applied version that should become the new CURRENT pointer, passing
   * it here avoids a redundant lookup of the full migration history. When
   * omitted, the implementation looks it up.
   */
  markAsRolledBack(version: string, previousVersion?: string): Promise<void>;

  /**
   * Mark migration as failed
   */
  markAsFailed(version: string, error: string): Promise<void>;

  /**
   * Record schema changes
   */
  recordSchemaChange(change: SchemaChange): Promise<void>;

  /**
   * Get migration by version
   */
  getMigration(version: string): Promise<MigrationRecord | null>;

  /**
   * Check if migration was applied
   */
  isApplied(version: string): Promise<boolean>;
}

/**
 * Migration file info
 */
export interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
  migration: Migration;
  checksum?: string;
}

/**
 * Migration status
 */
export interface MigrationStatus {
  version: string;
  name: string;
  status: 'pending' | 'applied' | 'rolled_back' | 'failed';
  appliedAt?: string;
  error?: string;
}
