import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { MigrationTracker, MigrationRecord, SchemaChange, MigrationConfig } from '../types';

export class DynamoDBMigrationTracker implements MigrationTracker {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private trackingPrefix: string;
  private gsi1Name: string;

  constructor(client: DynamoDBDocumentClient, config: MigrationConfig) {
    this.client = client;
    this.tableName = config.tableName;
    this.trackingPrefix = config.trackingPrefix || '_SCHEMA#VERSION';
    this.gsi1Name = config.gsi1Name || 'GSI1';
  }

  async initialize(): Promise<void> {
    // Check if current version pointer exists, if not create it
    const current = await this.getCurrentVersion();
    if (!current) {
      // Create initial version pointer
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `${this.trackingPrefix}#CURRENT`,
            SK: `${this.trackingPrefix}#CURRENT`,
            GSI1PK: 'SCHEMA#CURRENT',
            GSI1SK: 'v0000',
            currentVersion: 'v0000',
            updatedAt: new Date().toISOString(),
          },
        })
      );
    }
  }

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': this.trackingPrefix,
        },
      })
    );

    return (result.Items || []) as MigrationRecord[];
  }

  async getCurrentVersion(): Promise<string | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `${this.trackingPrefix}#CURRENT`,
          SK: `${this.trackingPrefix}#CURRENT`,
        },
      })
    );

    return result.Item?.currentVersion || null;
  }

  async markAsApplied(
    version: string,
    name: string,
    schemaDefinition?: Record<string, any>,
    schemaChanges?: SchemaChange[]
  ): Promise<void> {
    const now = new Date().toISOString();

    // Create migration record
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: this.trackingPrefix,
          SK: version,
          version,
          name,
          timestamp: now,
          appliedAt: now,
          status: 'applied',
          schemaDefinition,
          schemaChanges,
        } as MigrationRecord,
      })
    );

    // Update current version pointer
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `${this.trackingPrefix}#CURRENT`,
          SK: `${this.trackingPrefix}#CURRENT`,
        },
        UpdateExpression: 'SET currentVersion = :version, updatedAt = :updatedAt, GSI1SK = :gsi1sk',
        ExpressionAttributeValues: {
          ':version': version,
          ':updatedAt': now,
          ':gsi1sk': version,
        },
      })
    );
  }

  async markAsRolledBack(version: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.trackingPrefix,
          SK: version,
        },
        UpdateExpression: 'SET #status = :status, rolledBackAt = :timestamp',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'rolled_back',
          ':timestamp': new Date().toISOString(),
        },
      })
    );

    // Find previous version and update current pointer
    const migrations = await this.getAppliedMigrations();
    const appliedMigrations = migrations
      .filter((m) => m.status === 'applied' && m.version !== version)
      .sort((a, b) => b.version.localeCompare(a.version));

    const previousVersion = appliedMigrations[0]?.version || 'v0000';

    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `${this.trackingPrefix}#CURRENT`,
          SK: `${this.trackingPrefix}#CURRENT`,
        },
        UpdateExpression: 'SET currentVersion = :version, updatedAt = :updatedAt, GSI1SK = :gsi1sk',
        ExpressionAttributeValues: {
          ':version': previousVersion,
          ':updatedAt': new Date().toISOString(),
          ':gsi1sk': previousVersion,
        },
      })
    );
  }

  async markAsFailed(version: string, error: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.trackingPrefix,
          SK: version,
        },
        UpdateExpression: 'SET #status = :status, #error = :error, failedAt = :timestamp',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#error': 'error',
        },
        ExpressionAttributeValues: {
          ':status': 'failed',
          ':error': error,
          ':timestamp': new Date().toISOString(),
        },
      })
    );
  }

  async recordSchemaChange(change: SchemaChange): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    if (!currentVersion || currentVersion === 'v0000') {
      throw new Error('Cannot record schema change: No migration has been applied yet');
    }

    // Append to schemaChanges array
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.trackingPrefix,
          SK: currentVersion,
        },
        UpdateExpression:
          'SET schemaChanges = list_append(if_not_exists(schemaChanges, :empty_list), :change)',
        ExpressionAttributeValues: {
          ':empty_list': [],
          ':change': [change],
        },
      })
    );
  }

  async getMigration(version: string): Promise<MigrationRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.trackingPrefix,
          SK: version,
        },
      })
    );

    return (result.Item as MigrationRecord) || null;
  }

  async isApplied(version: string): Promise<boolean> {
    const migration = await this.getMigration(version);
    return migration?.status === 'applied';
  }
}
