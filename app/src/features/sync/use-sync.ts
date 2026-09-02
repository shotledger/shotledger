// Subscribes a screen to the single sync controller and wires the
// app-foreground trigger (docs/specs/sync-app-spec.md §7).
import type { SyncStatus } from '@shotledger/shared';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

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

export function useSync(enabled: boolean): UseSyncResult {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);

  useEffect(() => subscribeToSync(setStatus), []);

  useEffect(() => {
    void refreshPendingCount();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Foreground is the trigger that matters most: the other device's edits
    // land while this one is asleep.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void requestSync();
    });
    void requestSync();
    return () => subscription.remove();
  }, [enabled]);

  return { status, syncNow: () => void requestSync() };
}
