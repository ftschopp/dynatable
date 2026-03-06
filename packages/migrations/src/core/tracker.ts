import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { MigrationTracker, MigrationRecord, SchemaChange, MigrationConfig } from '../types';

const LOCK_TTL_SECONDS = 300; // 5 minutes

export class DynamoDBMigrationTracker implements MigrationTracker {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private trackingPrefix: string;
  private gsi1Name: string;
  private lockId: string | null = null;

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

  /**
   * Acquire a distributed lock to prevent concurrent migrations
   */
  async acquireLock(): Promise<boolean> {
    const lockKey = {
      PK: `${this.trackingPrefix}#LOCK`,
      SK: `${this.trackingPrefix}#LOCK`,
    };

    const now = Date.now();
    const expiresAt = now + LOCK_TTL_SECONDS * 1000;
    this.lockId = `lock-${now}-${Math.random().toString(36).substring(7)}`;

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            ...lockKey,
            lockId: this.lockId,
            acquiredAt: new Date().toISOString(),
            expiresAt,
          },
          // Only succeed if lock doesn't exist or has expired
          ConditionExpression:
            'attribute_not_exists(PK) OR expiresAt < :now',
          ExpressionAttributeValues: {
            ':now': now,
          },
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        this.lockId = null;
        return false;
      }
      throw error;
    }
  }

  /**
   * Release the distributed lock
   */
  async releaseLock(): Promise<void> {
    if (!this.lockId) return;

    const lockKey = {
      PK: `${this.trackingPrefix}#LOCK`,
      SK: `${this.trackingPrefix}#LOCK`,
    };

    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: lockKey,
          // Only delete if we own the lock
          ConditionExpression: 'lockId = :lockId',
          ExpressionAttributeValues: {
            ':lockId': this.lockId,
          },
        })
      );
    } catch (error: any) {
      // Lock may have expired or been taken by someone else
      if (error.name !== 'ConditionalCheckFailedException') {
        throw error;
      }
    } finally {
      this.lockId = null;
    }
  }

  /**
   * Get all applied migrations with pagination support
   */
  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const items: MigrationRecord[] = [];
    let lastKey: Record<string, any> | undefined;

    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': this.trackingPrefix,
          },
          ExclusiveStartKey: lastKey,
        })
      );

      items.push(...((result.Items || []) as MigrationRecord[]));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
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

  /**
   * Mark migration as applied using TransactWrite for atomicity
   * Handles both new migrations and re-applying rolled back migrations
   */
  async markAsApplied(
    version: string,
    name: string,
    schemaDefinition?: Record<string, any>,
    schemaChanges?: SchemaChange[],
    checksum?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    // Check if migration record already exists (e.g., rolled back or failed)
    const existing = await this.getMigration(version);

    if (existing) {
      // Update existing record (re-applying a rolled back or failed migration)
      // Build dynamic update expression - DynamoDB doesn't accept undefined values
      const setParts = ['#status = :status', 'appliedAt = :appliedAt', '#name = :name'];
      const expressionValues: Record<string, any> = {
        ':status': 'applied',
        ':appliedAt': now,
        ':name': name,
      };

      if (schemaDefinition !== undefined) {
        setParts.push('schemaDefinition = :schemaDef');
        expressionValues[':schemaDef'] = schemaDefinition;
      }
      if (schemaChanges !== undefined) {
        setParts.push('schemaChanges = :schemaChanges');
        expressionValues[':schemaChanges'] = schemaChanges;
      }
      if (checksum !== undefined) {
        setParts.push('checksum = :checksum');
        expressionValues[':checksum'] = checksum;
      }

      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.tableName,
                Key: {
                  PK: this.trackingPrefix,
                  SK: version,
                },
                UpdateExpression: `SET ${setParts.join(', ')} REMOVE #error, failedAt, rolledBackAt`,
                ExpressionAttributeNames: {
                  '#status': 'status',
                  '#name': 'name',
                  '#error': 'error',
                },
                ExpressionAttributeValues: expressionValues,
                // Only allow re-applying if not currently applied
                ConditionExpression: '#status <> :status',
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: {
                  PK: `${this.trackingPrefix}#CURRENT`,
                  SK: `${this.trackingPrefix}#CURRENT`,
                },
                UpdateExpression:
                  'SET currentVersion = :version, updatedAt = :updatedAt, GSI1SK = :gsi1sk',
                ExpressionAttributeValues: {
                  ':version': version,
                  ':updatedAt': now,
                  ':gsi1sk': version,
                },
              },
            },
          ],
        })
      );
    } else {
      // Create new migration record
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
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
                  checksum,
                } as MigrationRecord,
                // Ensure migration wasn't already applied
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: {
                  PK: `${this.trackingPrefix}#CURRENT`,
                  SK: `${this.trackingPrefix}#CURRENT`,
                },
                UpdateExpression:
                  'SET currentVersion = :version, updatedAt = :updatedAt, GSI1SK = :gsi1sk',
                ExpressionAttributeValues: {
                  ':version': version,
                  ':updatedAt': now,
                  ':gsi1sk': version,
                },
              },
            },
          ],
        })
      );
    }
  }

  /**
   * Mark migration as rolled back using TransactWrite for atomicity
   */
  async markAsRolledBack(version: string): Promise<void> {
    const now = new Date().toISOString();

    // Find previous version
    const migrations = await this.getAppliedMigrations();
    const appliedMigrations = migrations
      .filter((m) => m.status === 'applied' && m.version !== version)
      .sort((a, b) => b.version.localeCompare(a.version));

    const previousVersion = appliedMigrations[0]?.version || 'v0000';

    // Use TransactWrite to atomically update record and pointer
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
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
                ':timestamp': now,
              },
            },
          },
          {
            Update: {
              TableName: this.tableName,
              Key: {
                PK: `${this.trackingPrefix}#CURRENT`,
                SK: `${this.trackingPrefix}#CURRENT`,
              },
              UpdateExpression:
                'SET currentVersion = :version, updatedAt = :updatedAt, GSI1SK = :gsi1sk',
              ExpressionAttributeValues: {
                ':version': previousVersion,
                ':updatedAt': now,
                ':gsi1sk': previousVersion,
              },
            },
          },
        ],
      })
    );
  }

  async markAsFailed(version: string, error: string): Promise<void> {
    // Check if the migration record exists first
    const existing = await this.getMigration(version);

    if (existing) {
      // Update existing record
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
    } else {
      // Create new record for failed migration
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: this.trackingPrefix,
            SK: version,
            version,
            name: 'unknown',
            status: 'failed',
            error,
            failedAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
          },
        })
      );
    }
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
