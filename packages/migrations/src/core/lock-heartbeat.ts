import type { MigrationTracker } from '../types';

/**
 * Periodically refreshes the migration lock so that migrations longer than
 * the lock TTL don't have their lock taken by another worker.
 *
 * Returns a stop function. Call it from the same `finally` that releases
 * the lock to make sure the interval doesn't leak.
 *
 * The heartbeat fires every `ttlSeconds / 3` seconds. Errors from the
 * underlying refresh are logged and swallowed: if the lock is genuinely
 * lost, the next tracker mutation will fail its ConditionCheck and the
 * runner will surface a clear `TransactionCanceledException` to the user.
 */
export function startLockHeartbeat(
  tracker: MigrationTracker,
  ttlSeconds: number
): () => void {
  // Fire well before expiry so a single missed beat doesn't drop the lock.
  const intervalMs = Math.max(1_000, Math.floor((ttlSeconds * 1000) / 3));
  let active = true;

  const handle = setInterval(() => {
    if (!active) return;
    void tracker.refreshLock().catch((err: unknown) => {
      const name = (err as { name?: string } | null)?.name;
      const message = (err as { message?: string } | null)?.message ?? String(err);
      if (name === 'ConditionalCheckFailedException') {
        console.warn(
          '⚠️  Migration lock was taken by another process. ' +
            'Subsequent tracker writes will fail.'
        );
      } else {
        console.warn(`⚠️  Failed to refresh migration lock: ${message}`);
      }
    });
  }, intervalMs);

  // Don't keep the Node event loop alive just for the heartbeat.
  if (typeof handle.unref === 'function') {
    handle.unref();
  }

  return () => {
    active = false;
    clearInterval(handle);
  };
}
