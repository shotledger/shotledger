// The single sync loop (docs/specs/sync-app-spec.md §7). Module-level, so
// the sync guardrail "no concurrent independent loops" (ARCHITECTURE.md
// § Sync) is enforced by there being exactly one; every trigger funnels through requestSync().
import {
  classifySyncError,
  initialSyncStatus,
  nextBackoffMs,
  reduceSyncStatus,
  runSyncCycle,
  shouldRetry,
  type SyncCycleResult,
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

/**
 * Back-to-back continuations of a `partial` cycle per loop. A cycle already
 * moves up to 100 pull pages and 100 push batches, so five more cover any
 * real backlog; a server that always answers `partial` costs five extra
 * cycles per trigger, then waits for the next one.
 */
export const MAX_PARTIAL_RERUNS = 5;

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

/** Sync is only possible with a session. */
export function canSync(): boolean {
  return getSessionTokenCache() !== null;
}

export async function refreshPendingCount(): Promise<void> {
  const pendingCount = await createSyncStore(db).pendingCount();
  emit({ type: 'pendingChanged', pendingCount });
}

function cancelRetry(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/** `null` when the cycle failed (or could not start). */
async function runOnce(): Promise<SyncCycleResult['status'] | null> {
  const store = createSyncStore(db);
  emit({ type: 'started' });
  try {
    const result = await runSyncCycle({
      store,
      transport: getSyncTransport(),
      newId,
      onRefused: () => emit({ type: 'refused' }),
    });
    // A retry armed by an earlier failure in this loop has nothing left to do.
    cancelRetry();
    emit({
      type: 'succeeded',
      at: new Date().toISOString(),
      result,
      pendingCount: await store.pendingCount(),
    });
    // Photos move after the rows that reference them, and never block a
    // cycle: a failed upload is the queue's problem, not sync's.
    void runPhotoQueue();
    return result.status;
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
    return null;
  }
}

/**
 * Fire-and-forget. Never awaited by the UI; a second call while a cycle runs
 * schedules exactly one re-run rather than a second loop. A `partial` cycle
 * continues at once, up to MAX_PARTIAL_RERUNS times.
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
    let partialReruns = 0;
    let again: boolean;
    do {
      rerunRequested = false;
      const outcome = await runOnce();
      const continuePartial = outcome === 'partial' && partialReruns < MAX_PARTIAL_RERUNS;
      if (continuePartial) partialReruns += 1;
      // A cycle can end the session (unauthenticated), so check again.
      again = (rerunRequested || continuePartial) && canSync();
    } while (again);
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
