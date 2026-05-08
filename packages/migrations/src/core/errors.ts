/**
 * Thrown by `markAsApplied` when the version already has a tracking record
 * in a non-applied state (e.g. `failed`, `rolled_back`) and therefore
 * cannot be silently treated as an idempotent re-apply. Surfaces the
 * existing state so the caller can decide whether to retry, recover, or
 * roll back.
 */
export class MigrationAlreadyAppliedError extends Error {
  public readonly version: string;
  public readonly currentStatus: string | undefined;

  constructor(version: string, currentStatus: string | undefined) {
    super(
      `Migration "${version}" already has a tracking record in state ` +
        `"${currentStatus ?? 'unknown'}" — cannot mark as applied. ` +
        `If you want to re-apply this version, roll it back first ` +
        `(or recover the failed run) and try again.`
    );
    this.name = 'MigrationAlreadyAppliedError';
    this.version = version;
    this.currentStatus = currentStatus;
    if (typeof (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (
        Error as unknown as { captureStackTrace: (target: object, ctor: unknown) => void }
      ).captureStackTrace(this, MigrationAlreadyAppliedError);
    }
  }
}

/**
 * Thrown when a tracker write is cancelled because the migration lock was
 * taken by another process between `acquireLock()` and the write itself
 * (e.g. the original lock TTL expired and a second worker took over).
 *
 * The transaction was rolled back atomically — no partial state was
 * written. The safe action is to stop the current `up()` / `down()` run.
 */
export class MigrationLockLostError extends Error {
  public readonly version: string;

  constructor(version: string) {
    super(
      `Migration lock was lost during markAsApplied("${version}"). ` +
        `Another worker may have taken over. The transaction was rolled ` +
        `back atomically; no partial state was written.`
    );
    this.name = 'MigrationLockLostError';
    this.version = version;
    if (typeof (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (
        Error as unknown as { captureStackTrace: (target: object, ctor: unknown) => void }
      ).captureStackTrace(this, MigrationLockLostError);
    }
  }
}
