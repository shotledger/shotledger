// The single sync loop (docs/specs/sync-app-spec.md §7): one cycle at a time,
// a mid-cycle trigger re-runs once, writes are debounced, failures back off,
// and a dead session stops the loop. The engine itself (runSyncCycle) is
// stubbed; it has its own tests in shared/.
// A value import, so shared/'s one-off cold transform runs at file load
// rather than inside the first test's timeout.
import { nextBackoffMs, type SyncCycleResult, type SyncStatus } from '@shotledger/shared';

const mockClient: { db: object } = { db: { tag: 'drizzle-db' } };
jest.mock('@/db/client', () => ({
  get db() {
    return mockClient.db;
  },
}));

const mockNewId = jest.fn(() => 'id-1');
jest.mock('@/db/util', () => ({ newId: () => mockNewId() }));

const mockPendingCount = jest.fn(async () => 0);
const mockStore = { pendingCount: () => mockPendingCount() };
const mockCreateSyncStore = jest.fn((_db: unknown) => mockStore);
jest.mock('@/db/queries/sync-store', () => ({
  createSyncStore: (db: unknown) => mockCreateSyncStore(db),
}));

const mockClearSessionToken = jest.fn(async () => undefined);
jest.mock('@/platform/secure-store', () => ({
  clearSessionToken: () => mockClearSessionToken(),
}));

const mockToken: { value: string | null } = { value: null };
const mockTransport = { tag: 'transport' };
const mockSetSessionTokenCache = jest.fn((token: string | null) => {
  mockToken.value = token;
});
jest.mock('./client', () => ({
  getSessionTokenCache: () => mockToken.value,
  setSessionTokenCache: (token: string | null) => mockSetSessionTokenCache(token),
  getSyncTransport: () => mockTransport,
}));

const mockRunPhotoQueue = jest.fn(async () => undefined);
jest.mock('./photo-queue-runner', () => ({ runPhotoQueue: () => mockRunPhotoQueue() }));

const mockRunSyncCycle = jest.fn();
jest.mock('@shotledger/shared', () => ({
  ...jest.requireActual('@shotledger/shared'),
  runSyncCycle: (deps: unknown) => mockRunSyncCycle(deps),
}));

type Controller = typeof import('./sync-controller');
type Shared = typeof import('@shotledger/shared');

/**
 * Fresh controller state per test — status, the running flag and the timers
 * are module-level. `shared` comes from the same registry, so its error
 * classes are the ones the controller's `instanceof` checks see.
 */
function load(): { controller: Controller; shared: Shared } {
  let controller!: Controller;
  let shared!: Shared;
  jest.isolateModules(() => {
    controller = require('./sync-controller') as Controller;
    shared = require('@shotledger/shared') as Shared;
  });
  return { controller, shared };
}

const OK_RESULT: SyncCycleResult = {
  status: 'ok',
  pulled: 2,
  shadowed: 0,
  pushed: 3,
  rejected: 0,
  invalid: 0,
  duplicates: 0,
};

/** A cycle the test finishes by hand, to hold the loop mid-cycle. */
function holdNextCycle(): { finish: () => void; fail: (error: unknown) => void } {
  let finish!: () => void;
  let fail!: (error: unknown) => void;
  mockRunSyncCycle.mockImplementationOnce(
    () =>
      new Promise<SyncCycleResult>((resolve, reject) => {
        finish = () => resolve(OK_RESULT);
        fail = reject;
      }),
  );
  return { finish: () => finish(), fail: (error) => fail(error) };
}

/** Lets pending promise callbacks run without moving the clock. */
async function settle(): Promise<void> {
  await jest.advanceTimersByTimeAsync(0);
}

const NOW = new Date('2026-10-04T08:30:00.000Z');

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  mockClient.db = { tag: 'drizzle-db' };
  mockToken.value = 'session-token';
  mockPendingCount.mockResolvedValue(0);
  mockRunSyncCycle.mockResolvedValue(OK_RESULT);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('canSync', () => {
  it('is true with a database and a session token', () => {
    const { controller } = load();
    expect(controller.canSync()).toBe(true);
  });

  it('is false without a session token, and no cycle runs', async () => {
    mockToken.value = null;
    const { controller } = load();

    expect(controller.canSync()).toBe(false);
    await controller.requestSync();
    controller.notifyLocalWrite();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(mockRunSyncCycle).not.toHaveBeenCalled();
  });
});

describe('subscribeToSync', () => {
  it('hands a new listener the current status at once', () => {
    const { controller, shared } = load();
    const listener = jest.fn();

    controller.subscribeToSync(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(shared.initialSyncStatus);
  });

  it('hands a late subscriber the latest status, not the initial one', async () => {
    mockPendingCount.mockResolvedValue(4);
    const { controller } = load();
    await controller.requestSync();
    const listener = jest.fn();

    controller.subscribeToSync(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      state: 'idle',
      lastSyncedAt: NOW.toISOString(),
      pendingCount: 4,
      errorKey: null,
      attempt: 0,
      refusedCount: 0,
    });
  });

  it('streams every transition until unsubscribed', async () => {
    const { controller } = load();
    const seen: SyncStatus['state'][] = [];
    const unsubscribe = controller.subscribeToSync((status) => seen.push(status.state));

    await controller.requestSync();
    unsubscribe();
    await controller.requestSync();

    expect(seen).toEqual(['idle', 'syncing', 'idle']);
  });
});

describe('a successful cycle', () => {
  it('runs the engine with the store, the transport and the id source, then the photo queue', async () => {
    mockPendingCount.mockResolvedValue(1);
    const { controller } = load();

    await controller.requestSync();

    expect(mockCreateSyncStore).toHaveBeenCalledWith(mockClient.db);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
    const deps = mockRunSyncCycle.mock.calls[0][0] as {
      store: unknown;
      transport: unknown;
      newId: () => string;
    };
    expect(deps.store).toBe(mockStore);
    expect(deps.transport).toBe(mockTransport);
    expect(deps.newId()).toBe('id-1');
    expect(mockRunPhotoQueue).toHaveBeenCalledTimes(1);
    expect(controller.getSyncStatus()).toEqual({
      state: 'idle',
      lastSyncedAt: NOW.toISOString(),
      pendingCount: 1,
      errorKey: null,
      attempt: 0,
      refusedCount: 0,
    });
  });
});

describe('the single loop', () => {
  it('re-runs exactly once however many triggers arrive mid-cycle', async () => {
    const { controller } = load();
    const first = holdNextCycle();

    const loop = controller.requestSync();
    await settle();
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);

    // Three triggers while the first cycle is in flight: none starts a loop.
    await controller.requestSync();
    await controller.requestSync();
    await controller.requestSync();
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);

    first.finish();
    await loop;

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
  });

  it('does not re-run when nothing arrived mid-cycle', async () => {
    const { controller } = load();

    await controller.requestSync();

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh loop for a trigger after the previous one finished', async () => {
    const { controller } = load();

    await controller.requestSync();
    await controller.requestSync();

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
  });
});

describe('a partial cycle', () => {
  it('continues at once until a cycle drains', async () => {
    const { controller } = load();
    mockRunSyncCycle
      .mockResolvedValueOnce({ ...OK_RESULT, status: 'partial' })
      .mockResolvedValueOnce({ ...OK_RESULT, status: 'partial' })
      .mockResolvedValueOnce(OK_RESULT);

    await controller.requestSync();

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(3);
    expect(controller.getSyncStatus().state).toBe('idle');
  });

  it('stops after MAX_PARTIAL_RERUNS when the server never drains', async () => {
    const { controller } = load();
    mockRunSyncCycle.mockResolvedValue({ ...OK_RESULT, status: 'partial' });

    await controller.requestSync();

    expect(controller.MAX_PARTIAL_RERUNS).toBe(5);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1 + controller.MAX_PARTIAL_RERUNS);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1 + controller.MAX_PARTIAL_RERUNS);
  });

  it('gives every trigger its own continuation budget', async () => {
    const { controller } = load();
    mockRunSyncCycle.mockResolvedValue({ ...OK_RESULT, status: 'partial' });

    await controller.requestSync();
    await controller.requestSync();

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2 * (1 + controller.MAX_PARTIAL_RERUNS));
  });
});

describe('notifyLocalWrite', () => {
  it('coalesces a burst of writes into one cycle, 400 ms after the last', async () => {
    const { controller } = load();

    for (let i = 0; i < 5; i += 1) {
      controller.notifyLocalWrite();
      await jest.advanceTimersByTimeAsync(100);
    }
    // 100 ms have passed since the last write.
    await jest.advanceTimersByTimeAsync(299);
    expect(mockRunSyncCycle).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
  });

  it('refreshes the pending count on every write', async () => {
    mockPendingCount.mockResolvedValue(7);
    const { controller } = load();
    const listener = jest.fn();
    controller.subscribeToSync(listener);

    controller.notifyLocalWrite();
    controller.notifyLocalWrite();
    await settle();

    expect(mockPendingCount).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ pendingCount: 7 }));
  });

  it('still counts pending writes while signed out, but schedules no cycle', async () => {
    mockToken.value = null;
    mockPendingCount.mockResolvedValue(3);
    const { controller } = load();

    controller.notifyLocalWrite();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(controller.getSyncStatus().pendingCount).toBe(3);
    expect(mockRunSyncCycle).not.toHaveBeenCalled();
  });
});

describe('backoff after a failed cycle', () => {
  it('retries after nextBackoffMs(attempt - 1), growing with each consecutive failure', async () => {
    const { controller } = load();
    mockRunSyncCycle.mockRejectedValue(new TypeError('Network request failed'));

    await controller.requestSync();
    expect(controller.getSyncStatus()).toEqual(
      expect.objectContaining({ state: 'error', errorKey: 'network', attempt: 1 }),
    );

    const firstDelay = nextBackoffMs(0);
    expect(firstDelay).toBe(2_000);
    await jest.advanceTimersByTimeAsync(firstDelay - 1);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
    expect(controller.getSyncStatus().attempt).toBe(2);

    const secondDelay = nextBackoffMs(1);
    expect(secondDelay).toBe(4_000);
    await jest.advanceTimersByTimeAsync(secondDelay - 1);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(3);
  });

  it('stops retrying once a retry succeeds, and resets the attempt count', async () => {
    const { controller } = load();
    mockRunSyncCycle.mockRejectedValueOnce(new TypeError('Network request failed'));

    await controller.requestSync();
    await jest.advanceTimersByTimeAsync(2_000);

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
    expect(controller.getSyncStatus()).toEqual(
      expect.objectContaining({ state: 'idle', errorKey: null, attempt: 0 }),
    );
    await jest.advanceTimersByTimeAsync(600_000);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending retry when another trigger syncs successfully first', async () => {
    const { controller } = load();
    mockRunSyncCycle.mockRejectedValueOnce(new TypeError('Network request failed'));

    await controller.requestSync();
    await jest.advanceTimersByTimeAsync(500);
    await controller.requestSync();
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(600_000);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
  });

  it('cancels the retry when a re-run in the same loop succeeds', async () => {
    const { controller } = load();
    const first = holdNextCycle();

    const loop = controller.requestSync();
    await settle();
    await controller.requestSync();
    first.fail(new TypeError('Network request failed'));
    await loop;

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
    expect(controller.getSyncStatus().state).toBe('idle');
    await jest.advanceTimersByTimeAsync(600_000);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(2);
  });

  it('drops a pending retry on resetSyncController and notifies listeners', async () => {
    const { controller, shared } = load();
    mockRunSyncCycle.mockRejectedValueOnce(new TypeError('Network request failed'));
    await controller.requestSync();
    const listener = jest.fn();
    controller.subscribeToSync(listener);

    controller.resetSyncController();

    expect(listener).toHaveBeenLastCalledWith(shared.initialSyncStatus);
    expect(controller.getSyncStatus()).toEqual(shared.initialSyncStatus);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
  });
});

describe('an unauthenticated cycle', () => {
  it('clears the session token, stops syncing and schedules no retry', async () => {
    const { controller, shared } = load();
    mockRunSyncCycle.mockRejectedValue(
      new shared.SyncHttpError(401, 'unauthenticated', 'session expired'),
    );

    await controller.requestSync();

    expect(controller.getSyncStatus()).toEqual(
      expect.objectContaining({ state: 'error', errorKey: 'unauthenticated', attempt: 1 }),
    );
    expect(mockSetSessionTokenCache).toHaveBeenCalledTimes(1);
    expect(mockSetSessionTokenCache).toHaveBeenCalledWith(null);
    expect(mockClearSessionToken).toHaveBeenCalledTimes(1);
    expect(controller.canSync()).toBe(false);

    await jest.advanceTimersByTimeAsync(600_000);
    controller.notifyLocalWrite();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
  });

  it('drops a re-run queued before the session ended', async () => {
    const { controller, shared } = load();
    const first = holdNextCycle();

    const loop = controller.requestSync();
    await settle();
    await controller.requestSync();
    first.fail(new shared.SyncHttpError(401, 'unauthenticated', 'session expired'));
    await loop;

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
    expect(mockClearSessionToken).toHaveBeenCalledTimes(1);
  });

  it('treats a 401 from the auth client the same way', async () => {
    const { controller, shared } = load();
    mockRunSyncCycle.mockRejectedValue(new shared.AuthError(401, 'unauthorized'));

    await controller.requestSync();

    expect(controller.getSyncStatus().errorKey).toBe('unauthenticated');
    expect(mockSetSessionTokenCache).toHaveBeenCalledWith(null);
    expect(mockClearSessionToken).toHaveBeenCalledTimes(1);
  });

  it('keeps the token on any other failure', async () => {
    const { controller, shared } = load();
    mockRunSyncCycle.mockRejectedValue(
      new shared.SyncHttpError(426, 'versionUnsupported', 'upgrade required'),
    );

    await controller.requestSync();

    expect(controller.getSyncStatus().errorKey).toBe('versionUnsupported');
    expect(mockSetSessionTokenCache).not.toHaveBeenCalled();
    expect(mockClearSessionToken).not.toHaveBeenCalled();
    expect(controller.canSync()).toBe(true);
  });
});
