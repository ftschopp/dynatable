import * as readline from 'readline';
import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from '../core/client';
import { MigrationConfig } from '../types';

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(prompt, resolve);
    });
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Unconditionally delete the migration lock row. Use only when the
 * lock owner has crashed and you need to retake the lock before the
 * 5-minute TTL clears it on its own.
 */
export async function forceUnlock(config: MigrationConfig, yes: boolean = false): Promise<void> {
  const trackingPrefix = config.trackingPrefix || '_SCHEMA#VERSION';
  const lockKey = {
    PK: `${trackingPrefix}#LOCK`,
    SK: `${trackingPrefix}#LOCK`,
  };

  const client = createDynamoDBClient(config);

  const existing = await client.send(
    new GetCommand({ TableName: config.tableName, Key: lockKey })
  );

  if (!existing.Item) {
    console.log('✅ No migration lock is held — nothing to unlock.\n');
    return;
  }

  const acquiredAt = existing.Item.acquiredAt ?? '<unknown>';
  const expiresAt = existing.Item.expiresAt ?? '<unknown>';
  const lockId = existing.Item.lockId ?? '<unknown>';

  console.log(`\n⚠️  Force-unlock will delete the migration lock on "${config.tableName}":`);
  console.log(`   lockId:     ${lockId}`);
  console.log(`   acquiredAt: ${acquiredAt}`);
  console.log(`   expiresAt:  ${expiresAt}`);
  console.log('\n   Only run this if you are certain the lock owner is no longer running.');

  if (!yes) {
    const ok = await confirm('   Proceed? [y/N] ');
    if (!ok) {
      console.log('Aborted. Lock left in place.\n');
      return;
    }
  }

  await client.send(new DeleteCommand({ TableName: config.tableName, Key: lockKey }));
  console.log('🔓 Lock released.\n');
}
