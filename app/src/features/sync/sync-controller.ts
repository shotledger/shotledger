// The single sync loop (docs/specs/sync-app-spec.md §7). Module-level, so
// ADR 0003's "no concurrent independent loops" is enforced by there being
// exactly one; every trigger funnels through requestSync().
import {
  classifySyncError,
  initialSyncStatus,
  nextBackoffMs,
  reduceSyncStatus,
  runSyncCycle,
  shouldRetry,
  type SyncEvent,
  type SyncStatus,
} from '@shotledger/shared';
import { newId } from '@/db/util';

import { db } from '@/db/client';
import { createSyncStore } from '@/db/queries/sync-store';
import { clearSessionToken } from '@/platform/secure-store';
import { getSessionTokenCache, getSyncTransport, setSessionTokenCache } from './client';
import { runPhotoQueue } from './photo-queue-runner';

type Listener = (status: SyncStatus) => void;

let status: SyncStatus = initialSyncStatus;
const listeners = new Set<Listener>();

let running = false;
/** Set when a trigger arrives mid-cycle: the running cycle re-runs once. */
let rerunRequested = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let writeDebounce: ReturnType<typeof setTimeout> | null = null;

const WRITE_DEBOUNCE_MS = 400;

function emit(event: SyncEvent): void {
  status = reduceSyncStatus(status, event);
  for (const listener of listeners) listener(status);
}

export function subscribeToSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

/** Sync is only possible with a session and a real (native) database. */
export function canSync(): boolean {
  return db !== null && getSessionTokenCache() !== null;
}

export async function refreshPendingCount(): Promise<void> {
  if (!db) return;
  const pendingCount = await createSyncStore(db).pendingCount();
  emit({ type: 'pendingChanged', pendingCount });
}

function cancelRetry(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

async function runOnce(): Promise<void> {
  if (!db) return;
  const store = createSyncStore(db);
  emit({ type: 'started' });
  try {
    const result = await runSyncCycle({ store, transport: getSyncTransport(), newId });
    emit({
      type: 'succeeded',
      at: new Date().toISOString(),
      result,
      pendingCount: await store.pendingCount(),
    });
    // Photos move after the rows that reference them, and never block a
    // cycle: a failed upload is the queue's problem, not sync's.
    void runPhotoQueue();
  } catch (error) {
    const errorKey = classifySyncError(error);
    emit({ type: 'failed', errorKey });
    if (errorKey === 'unauthenticated') {
      // The session is gone (signed out elsewhere, or the account deleted).
      // Dropping the token stops canSync() and with it every trigger — the
      // alternative is a 401 on every foreground until the app is reinstalled.
      // Queued changes and cursors are kept: signing back in resumes them.
      setSessionTokenCache(null);
      void clearSessionToken();
    }
    if (shouldRetry(errorKey)) {
      cancelRetry();
      retryTimer = setTimeout(
        () => {
          retryTimer = null;
          void requestSync();
        },
        nextBackoffMs(status.attempt - 1),
      );
    }
  }
}

/**
 * Fire-and-forget. Never awaited by the UI; a second call while a cycle runs
 * schedules exactly one re-run rather than a second loop.
 */
export async function requestSync(): Promise<void> {
  if (!canSync()) return;
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  cancelRetry();
  try {
    do {
      rerunRequested = false;
      await runOnce();
    } while (rerunRequested);
  } finally {
    running = false;
  }
}

/**
 * Called after a local write. Debounced, because a scoring session writes a
 * row per shot — the outbox trigger has already captured every one of them,
 * so coalescing the *trigger* only ever delays a push, never drops it.
 */
export function notifyLocalWrite(): void {
  void refreshPendingCount();
  if (!canSync()) return;
  if (writeDebounce !== null) clearTimeout(writeDebounce);
  writeDebounce = setTimeout(() => {
    writeDebounce = null;
    void requestSync();
  }, WRITE_DEBOUNCE_MS);
}

/** Test/sign-out hook: drops timers and returns the status to its initial value. */
export function resetSyncController(): void {
  cancelRetry();
  if (writeDebounce !== null) {
    clearTimeout(writeDebounce);
    writeDebounce = null;
  }
  status = initialSyncStatus;
  for (const listener of listeners) listener(status);
}
