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

export interface MigrationTrackerHandle extends MigrationTracker {
  readonly lockTtlSeconds: number;
  acquireLock(): Promise<boolean>;
  refreshLock(): Promise<void>;
  releaseLock(): Promise<void>;
  initialize(): Promise<void>;
  getAppliedMigrations(): Promise<MigrationRecord[]>;
  getCurrentVersion(): Promise<string | null>;
  markAsApplied(
    version: string,
    name: string,
    schemaDefinition?: Record<string, any>,
    schemaChanges?: SchemaChange[],
    checksum?: string
  ): Promise<void>;
  markAsRolledBack(version: string, previousVersion?: string): Promise<void>;
  markAsFailed(version: string, error: string): Promise<void>;
  recordSchemaChange(change: SchemaChange): Promise<void>;
  getMigration(version: string): Promise<MigrationRecord | null>;
  isApplied(version: string): Promise<boolean>;
}

/**
 * Create a DynamoDB-backed migration tracker.
 *
 * The tracker carries one piece of genuinely mutable state: the current
 * lock id, set by `acquireLock()` and cleared by `releaseLock()`. Everything
 * else is derived from the config or read from DynamoDB on demand.
 */
export const createMigrationTracker = (
  client: DynamoDBDocumentClient,
  config: MigrationConfig
): MigrationTrackerHandle => {
  const tableName = config.tableName;
  const trackingPrefix = config.trackingPrefix || '_SCHEMA#VERSION';
  const lockTtlSeconds = config.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;

  let lockId: string | null = null;

  const lockKey = {
    PK: `${trackingPrefix}#LOCK`,
    SK: `${trackingPrefix}#LOCK`,
  };

  /** Throws if there is no active lock. Call before any tracker write. */
  const requireLock = (): void => {
    if (!lockId) {
      throw new Error(
        'Tracker has no active lock; refusing to issue tracker mutations. ' +
          'Call acquireLock() first.'
      );
    }
  };

  /** Builds a TransactWrite ConditionCheck that asserts we still own the lock. */
  const lockOwnershipCheck = () => {
    requireLock();
    return {
      ConditionCheck: {
        TableName: tableName,
        Key: lockKey,
        ConditionExpression: 'lockId = :lockId',
        ExpressionAttributeValues: { ':lockId': lockId },
      },
    };
  };

  const getCurrentVersion = async (): Promise<string | null> => {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: `${trackingPrefix}#CURRENT`,
          SK: `${trackingPrefix}#CURRENT`,
        },
      })
    );
    return result.Item?.currentVersion || null;
  };

  const initialize = async (): Promise<void> => {
    const current = await getCurrentVersion();
    if (current) return;

    // Create initial version pointer. The condition prevents two
    // concurrent first-run inits from each writing the row — without
    // it, both reads return null, both Puts succeed, and the second
    // silently overwrites the first.
    try {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: `${trackingPrefix}#CURRENT`,
            SK: `${trackingPrefix}#CURRENT`,
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
  };

  /**
   * Acquire a distributed lock to prevent concurrent migrations.
   *
   * `expiresAt` is stored as an ISO 8601 string for consistency with every
   * other timestamp in the tracker (`appliedAt`, `updatedAt`, `failedAt`,
   * `rolledBackAt`, `acquiredAt`). ISO 8601 is lexicographically ordered the
   * same way it's chronologically ordered, so the `<=` condition still
   * compares correctly.
   */
  const acquireLock = async (): Promise<boolean> => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresAtIso = new Date(now + lockTtlSeconds * 1000).toISOString();
    const newLockId = `lock-${now}-${Math.random().toString(36).substring(7)}`;
    lockId = newLockId;

    try {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...lockKey,
            lockId: newLockId,
            acquiredAt: nowIso,
            expiresAt: expiresAtIso,
          },
          // Only succeed if lock doesn't exist or has expired. The `<=`
          // covers the boundary where two clocks read the exact ms.
          ConditionExpression: 'attribute_not_exists(PK) OR expiresAt <= :now',
          ExpressionAttributeValues: { ':now': nowIso },
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        lockId = null;
        return false;
      }
      throw error;
    }
  };

  const refreshLock = async (): Promise<void> => {
    if (!lockId) return;
    const newExpiresAtIso = new Date(Date.now() + lockTtlSeconds * 1000).toISOString();
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: lockKey,
        UpdateExpression: 'SET expiresAt = :exp',
        ConditionExpression: 'lockId = :lockId',
        ExpressionAttributeValues: { ':exp': newExpiresAtIso, ':lockId': lockId },
      })
    );
  };

  const releaseLock = async (): Promise<void> => {
    if (!lockId) return;
    try {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: lockKey,
          ConditionExpression: 'lockId = :lockId',
          ExpressionAttributeValues: { ':lockId': lockId },
        })
      );
    } catch (error: any) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
    } finally {
      lockId = null;
    }
  };

  /**
   * Get all applied migrations with pagination support.
   *
   * Projects only the lightweight bookkeeping fields — the heavy
   * `schemaDefinition` and `schemaChanges` blobs are intentionally omitted,
   * because no internal caller reads them and including them blows up the
   * 1MB-per-page budget (and consumed RCU) on tables with many migrations.
   */
  const getAppliedMigrations = async (): Promise<MigrationRecord[]> => {
    const pages: MigrationRecord[][] = [];
    let lastKey: Record<string, any> | undefined;
    do {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
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
          ExpressionAttributeValues: { ':pk': trackingPrefix },
          ExclusiveStartKey: lastKey,
        })
      );
      pages.push((result.Items ?? []) as MigrationRecord[]);
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return pages.flat();
  };

  const getMigration = async (version: string): Promise<MigrationRecord | null> => {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: trackingPrefix, SK: version },
      })
    );
    return (result.Item as MigrationRecord) || null;
  };

  /**
   * Inspect a `TransactionCanceledException` raised by `markAsApplied` and
   * either swallow it (idempotent re-apply) or re-throw a typed error.
   */
  const handleMarkAsAppliedCancellation = async (
    err: unknown,
    version: string
  ): Promise<void> => {
    const error = err as { name?: string; CancellationReasons?: Array<{ Code?: string }> } | null;
    if (error?.name !== 'TransactionCanceledException') throw err;
    const reasons = error.CancellationReasons ?? [];
    const lockReason = reasons[0];
    const migrationReason = reasons[1];

    if (lockReason?.Code === 'ConditionalCheckFailed') {
      throw new MigrationLockLostError(version);
    }
    if (migrationReason?.Code === 'ConditionalCheckFailed') {
      const current = await getMigration(version);
      if (current?.status === 'applied') {
        return;
      }
      throw new MigrationAlreadyAppliedError(version, current?.status);
    }
    throw err;
  };

  /**
   * Mark migration as applied using TransactWrite for atomicity
   * Handles both new migrations and re-applying rolled back migrations
   */
  const markAsApplied = async (
    version: string,
    name: string,
    schemaDefinition?: Record<string, any>,
    schemaChanges?: SchemaChange[],
    checksum?: string
  ): Promise<void> => {
    requireLock();
    const now = new Date().toISOString();
    const existing = await getMigration(version);

    try {
      if (existing) {
        // Update existing record (re-applying a rolled back or failed migration).
        // Build expression and values purely from the optional fields.
        const optionalFields = [
          ['schemaDefinition', schemaDefinition, ':schemaDef'],
          ['schemaChanges', schemaChanges, ':schemaChanges'],
          ['checksum', checksum, ':checksum'],
        ] as const;
        const presentFields = optionalFields.filter(([, value]) => value !== undefined);

        const setExpr = [
          '#status = :status',
          'appliedAt = :appliedAt',
          '#name = :name',
          ...presentFields.map(([field, , placeholder]) => `${field} = ${placeholder}`),
        ].join(', ');

        const expressionValues = {
          ':status': 'applied',
          ':appliedAt': now,
          ':name': name,
          ...Object.fromEntries(presentFields.map(([, value, placeholder]) => [placeholder, value])),
        };

        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              lockOwnershipCheck(),
              {
                Update: {
                  TableName: tableName,
                  Key: { PK: trackingPrefix, SK: version },
                  UpdateExpression: `SET ${setExpr} REMOVE #error, failedAt, rolledBackAt`,
                  ExpressionAttributeNames: {
                    '#status': 'status',
                    '#name': 'name',
                    '#error': 'error',
                  },
                  ExpressionAttributeValues: expressionValues,
                  ConditionExpression: '#status <> :status',
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: {
                    PK: `${trackingPrefix}#CURRENT`,
                    SK: `${trackingPrefix}#CURRENT`,
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
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              lockOwnershipCheck(),
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    PK: trackingPrefix,
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
                  TableName: tableName,
                  Key: {
                    PK: `${trackingPrefix}#CURRENT`,
                    SK: `${trackingPrefix}#CURRENT`,
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
      await handleMarkAsAppliedCancellation(err, version);
    }
  };

  const markAsRolledBack = async (
    version: string,
    previousVersion?: string
  ): Promise<void> => {
    requireLock();
    const now = new Date().toISOString();

    const resolvedPrevious =
      previousVersion ??
      (await getAppliedMigrations()
        .then((migrations) =>
          migrations
            .filter((m) => m.status === 'applied' && m.version !== version)
            .sort((a, b) => compareSemver(b.version, a.version))
        )
        .then((sorted) => sorted[0]?.version || 'v0000'));

    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          lockOwnershipCheck(),
          {
            Update: {
              TableName: tableName,
              Key: { PK: trackingPrefix, SK: version },
              UpdateExpression: 'SET #status = :status, rolledBackAt = :timestamp',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':status': 'rolled_back',
                ':timestamp': now,
              },
            },
          },
          {
            Update: {
              TableName: tableName,
              Key: {
                PK: `${trackingPrefix}#CURRENT`,
                SK: `${trackingPrefix}#CURRENT`,
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
  };

  const markAsFailed = async (version: string, error: string): Promise<void> => {
    requireLock();
    const existing = await getMigration(version);
    const now = new Date().toISOString();

    if (existing) {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            lockOwnershipCheck(),
            {
              Update: {
                TableName: tableName,
                Key: { PK: trackingPrefix, SK: version },
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
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            lockOwnershipCheck(),
            {
              Put: {
                TableName: tableName,
                Item: {
                  PK: trackingPrefix,
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
  };

  const recordSchemaChange = async (change: SchemaChange): Promise<void> => {
    requireLock();
    const currentVersion = await getCurrentVersion();
    if (!currentVersion || currentVersion === 'v0000') {
      throw new Error('Cannot record schema change: No migration has been applied yet');
    }

    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          lockOwnershipCheck(),
          {
            Update: {
              TableName: tableName,
              Key: { PK: trackingPrefix, SK: currentVersion },
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
  };

  const isApplied = async (version: string): Promise<boolean> => {
    const migration = await getMigration(version);
    return migration?.status === 'applied';
  };

  return {
    lockTtlSeconds,
    initialize,
    acquireLock,
    refreshLock,
    releaseLock,
    getAppliedMigrations,
    getCurrentVersion,
    markAsApplied,
    markAsRolledBack,
    markAsFailed,
    recordSchemaChange,
    getMigration,
    isApplied,
  };
};
