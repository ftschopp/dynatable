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
import { compareSemver } from './semver';
import { MigrationAlreadyAppliedError, MigrationLockLostError } from './errors';

/** Default lock TTL in seconds. Configurable via MigrationConfig.lockTtlSeconds. */
export const DEFAULT_LOCK_TTL_SECONDS = 300; // 5 minutes

export class DynamoDBMigrationTracker implements MigrationTracker {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private trackingPrefix: string;
  private gsi1Name: string;
  private lockId: string | null = null;
  /** TTL for newly-acquired or refreshed locks. */
  public readonly lockTtlSeconds: number;

  constructor(client: DynamoDBDocumentClient, config: MigrationConfig) {
    this.client = client;
    this.tableName = config.tableName;
    this.trackingPrefix = config.trackingPrefix || '_SCHEMA#VERSION';
    this.gsi1Name = config.gsi1Name || 'GSI1';
    this.lockTtlSeconds = config.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;
  }

  private get lockKey() {
    return {
      PK: `${this.trackingPrefix}#LOCK`,
      SK: `${this.trackingPrefix}#LOCK`,
    };
  }

  /** Throws if there is no active lock. Call before any tracker write. */
  private requireLock(): void {
    if (!this.lockId) {
      throw new Error(
        'Tracker has no active lock; refusing to issue tracker mutations. ' +
          'Call acquireLock() first.'
      );
    }
  }

  /** Builds a TransactWrite ConditionCheck that asserts we still own the lock. */
  private lockOwnershipCheck() {
    this.requireLock();
    return {
      ConditionCheck: {
        TableName: this.tableName,
        Key: this.lockKey,
        ConditionExpression: 'lockId = :lockId',
        ExpressionAttributeValues: {
          ':lockId': this.lockId,
        },
      },
    };
  }

  async initialize(): Promise<void> {
    // Check if current version pointer exists, if not create it
    const current = await this.getCurrentVersion();
    if (!current) {
      // Create initial version pointer. The condition prevents two
      // concurrent first-run inits from each writing the row — without
      // it, both reads return null, both Puts succeed, and the second
      // silently overwrites the first.
      try {
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
            ConditionExpression: 'attribute_not_exists(PK)',
          })
        );
      } catch (err: any) {
        // Another worker initialized first — that's the desired post-state.
        if (err?.name !== 'ConditionalCheckFailedException') throw err;
      }
    }
  }

  /**
   * Acquire a distributed lock to prevent concurrent migrations
   */
  async acquireLock(): Promise<boolean> {
    const now = Date.now();
    const expiresAt = now + this.lockTtlSeconds * 1000;
    this.lockId = `lock-${now}-${Math.random().toString(36).substring(7)}`;

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            ...this.lockKey,
            lockId: this.lockId,
            acquiredAt: new Date().toISOString(),
            expiresAt,
          },
          // Only succeed if lock doesn't exist or has expired. The `<=`
          // covers the boundary where two clocks read the exact ms.
          ConditionExpression: 'attribute_not_exists(PK) OR expiresAt <= :now',
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
   * Extend the lock's expiration by another `lockTtlSeconds`. Throws
   * `ConditionalCheckFailedException` if another worker has already taken
   * the lock — callers should treat that as "we lost the race; stop
   * making writes". Silent no-op if no lock is currently held.
   */
  async refreshLock(): Promise<void> {
    if (!this.lockId) return;

    const newExpiresAt = Date.now() + this.lockTtlSeconds * 1000;

    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: this.lockKey,
        UpdateExpression: 'SET expiresAt = :exp',
        ConditionExpression: 'lockId = :lockId',
        ExpressionAttributeValues: {
          ':exp': newExpiresAt,
          ':lockId': this.lockId,
        },
      })
    );
  }

  /**
   * Release the distributed lock
   */
  async releaseLock(): Promise<void> {
    if (!this.lockId) return;

    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: this.lockKey,
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
   * Get all applied migrations with pagination support.
   *
   * Projects only the lightweight bookkeeping fields — the heavy
   * `schemaDefinition` and `schemaChanges` blobs are intentionally omitted,
   * because no internal caller reads them and including them blows up the
   * 1MB-per-page budget (and consumed RCU) on tables with many migrations.
   * If a future caller needs the full record, fetch by version with
   * `getMigration(version)`.
   */
  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const items: MigrationRecord[] = [];
    let lastKey: Record<string, any> | undefined;

    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          // `name` and `status` are DynamoDB reserved words; alias them.
          ProjectionExpression:
            'PK, SK, version, #name, #status, appliedAt, #ts, #err, checksum, failedAt, rolledBackAt, description',
          ExpressionAttributeNames: {
            '#name': 'name',
            '#status': 'status',
            '#ts': 'timestamp',
            '#err': 'error',
          },
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
    this.requireLock();
    const now = new Date().toISOString();

    // Check if migration record already exists (e.g., rolled back or failed)
    const existing = await this.getMigration(version);

    try {
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
              this.lockOwnershipCheck(),
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
              this.lockOwnershipCheck(),
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
                  // Ensure migration wasn't already applied (uniqueness on
                  // SK; PK is shared across all migration rows).
                  ConditionExpression: 'attribute_not_exists(SK)',
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
    } catch (err: unknown) {
      await this.handleMarkAsAppliedCancellation(err, version);
    }
  }

  /**
   * Inspect a `TransactionCanceledException` raised by `markAsApplied` and
   * either swallow it (idempotent re-apply) or re-throw a typed error.
   *
   * The TransactWrite items are: [lockOwnershipCheck, migrationRow, currentPointer].
   * Each item produces an entry in `CancellationReasons`.
   *   - reasons[0] failing → the lock was lost → MigrationLockLostError.
   *   - reasons[1] failing → the migration row already exists in a state the
   *     write refused. Re-fetch the record:
   *       * status === 'applied' → idempotent re-apply, return silently.
   *       * other states         → MigrationAlreadyAppliedError with the
   *         current state, so the caller can decide what to do.
   */
  private async handleMarkAsAppliedCancellation(
    err: unknown,
    version: string
  ): Promise<void> {
    const error = err as { name?: string; CancellationReasons?: Array<{ Code?: string }> } | null;
    if (error?.name !== 'TransactionCanceledException') {
      throw err;
    }
    const reasons = error.CancellationReasons ?? [];
    const lockReason = reasons[0];
    const migrationReason = reasons[1];

    if (lockReason?.Code === 'ConditionalCheckFailed') {
      throw new MigrationLockLostError(version);
    }
    if (migrationReason?.Code === 'ConditionalCheckFailed') {
      const current = await this.getMigration(version);
      if (current?.status === 'applied') {
        // Either we re-tried our own write or another worker applied the same
        // version. Either way, the desired post-state is already satisfied.
        return;
      }
      throw new MigrationAlreadyAppliedError(version, current?.status);
    }
    throw err;
  }

  /**
   * Mark migration as rolled back using TransactWrite for atomicity.
   *
   * @param previousVersion Optional. The version the CURRENT pointer should
   *   move to after this rollback. When the caller already knows it (the
   *   runner does — it loaded the applied list once at the top of `down()`),
   *   passing it here skips a `getAppliedMigrations()` Query per rollback.
   *   Without this hint, a multi-step rollback was N×(paginated Query of
   *   the entire migration history). When omitted, the tracker falls back
   *   to looking it up.
   */
  async markAsRolledBack(version: string, previousVersion?: string): Promise<void> {
    this.requireLock();
    const now = new Date().toISOString();

    let resolvedPrevious = previousVersion;
    if (resolvedPrevious === undefined) {
      // Find previous version
      const migrations = await this.getAppliedMigrations();
      const appliedMigrations = migrations
        .filter((m) => m.status === 'applied' && m.version !== version)
        .sort((a, b) => compareSemver(b.version, a.version));

      resolvedPrevious = appliedMigrations[0]?.version || 'v0000';
    }

    // Use TransactWrite to atomically update record and pointer
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          this.lockOwnershipCheck(),
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
                ':version': resolvedPrevious,
                ':updatedAt': now,
                ':gsi1sk': resolvedPrevious,
              },
            },
          },
        ],
      })
    );
  }

  async markAsFailed(version: string, error: string): Promise<void> {
    this.requireLock();
    // Check if the migration record exists first
    const existing = await this.getMigration(version);
    const now = new Date().toISOString();

    if (existing) {
      // Update existing record, gated by lock ownership
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            this.lockOwnershipCheck(),
            {
              Update: {
                TableName: this.tableName,
                Key: {
                  PK: this.trackingPrefix,
                  SK: version,
                },
                UpdateExpression:
                  'SET #status = :status, #error = :error, failedAt = :timestamp',
                ExpressionAttributeNames: {
                  '#status': 'status',
                  '#error': 'error',
                },
                ExpressionAttributeValues: {
                  ':status': 'failed',
                  ':error': error,
                  ':timestamp': now,
                },
              },
            },
          ],
        })
      );
    } else {
      // Create new record for failed migration, gated by lock ownership
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            this.lockOwnershipCheck(),
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: this.trackingPrefix,
                  SK: version,
                  version,
                  name: 'unknown',
                  status: 'failed',
                  error,
                  failedAt: now,
                  timestamp: now,
                },
              },
            },
          ],
        })
      );
    }
  }

  async recordSchemaChange(change: SchemaChange): Promise<void> {
    this.requireLock();
    const currentVersion = await this.getCurrentVersion();
    if (!currentVersion || currentVersion === 'v0000') {
      throw new Error('Cannot record schema change: No migration has been applied yet');
    }

    // Append to schemaChanges array, gated by lock ownership
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          this.lockOwnershipCheck(),
          {
            Update: {
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
            },
          },
        ],
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
