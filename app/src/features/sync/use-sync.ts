// Subscribes a screen to the single sync controller
// (docs/specs/sync-app-spec.md §7). The foreground and post-write triggers
// live in SyncTriggers, mounted once at the root — a screen only reads
// status and offers the manual button.
import type { SyncStatus } from '@shotledger/shared';
import { useEffect, useState } from 'react';

import {
  getSyncStatus,
  refreshPendingCount,
  requestSync,
  subscribeToSync,
} from './sync-controller';

export interface UseSyncResult {
  status: SyncStatus;
  syncNow: () => void;
}

export function useSync(signedIn: boolean): UseSyncResult {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);

  useEffect(() => subscribeToSync(setStatus), []);

  useEffect(() => {
    // Signing in makes the queue meaningful; recount so the screen does not
    // show a stale "0 changes waiting".
    void refreshPendingCount();
  }, [signedIn]);

  return { status, syncNow: () => void requestSync() };
}
