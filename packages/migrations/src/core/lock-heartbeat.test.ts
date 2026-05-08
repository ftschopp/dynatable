import { startLockHeartbeat } from './lock-heartbeat';
import type { MigrationTracker } from '../types';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function makeTracker(refresh: jest.Mock): MigrationTracker {
  // Only the methods the heartbeat actually touches need to be present.
  return {
    refreshLock: refresh,
  } as unknown as MigrationTracker;
}

describe('startLockHeartbeat', () => {
  test('calls refreshLock every ~ttl/3 seconds', () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const tracker = makeTracker(refresh);
    const stop = startLockHeartbeat(tracker, 30); // every 10s

    jest.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(2);

    stop();
  });

  test('stop() clears the interval and prevents further refreshes', () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const tracker = makeTracker(refresh);
    const stop = startLockHeartbeat(tracker, 30);

    jest.advanceTimersByTime(10_000);
    stop();
    jest.advanceTimersByTime(60_000);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('clamps the interval to a 1s minimum even with absurdly small TTLs', () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const tracker = makeTracker(refresh);
    const stop = startLockHeartbeat(tracker, 0.5); // would compute < 1s

    jest.advanceTimersByTime(999);
    expect(refresh).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    stop();
  });

  test('swallows refresh errors so transient failures do not crash the runner', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'NetworkError' }));
    const tracker = makeTracker(refresh);
    const stop = startLockHeartbeat(tracker, 30);

    jest.advanceTimersByTime(10_000);
    // Let the rejected promise settle
    await Promise.resolve();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();

    stop();
    warn.mockRestore();
  });
});
