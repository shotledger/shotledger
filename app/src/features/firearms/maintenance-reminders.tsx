// Keeps the time-based "maintenance due" reminders (#800) in step with the
// database without any screen open: at app start, on return to the
// foreground, and after each completed sync, since an interval or a
// maintenance entered on another device arrives that way. Never prompts for
// notification permission; saving an interval is what asks.
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { subscribeToSync } from '@/features/sync/sync-controller';
import { refreshMaintenanceTimeReminders } from './maintenance';

export function MaintenanceReminders() {
  useEffect(() => {
    const refresh = () => void refreshMaintenanceTimeReminders({ request: false });
    refresh();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    // Undefined until the first call, which reports the current status
    // rather than a sync that just finished.
    let lastSyncedAt: string | null | undefined;
    const unsubscribe = subscribeToSync((status) => {
      if (lastSyncedAt !== undefined && status.lastSyncedAt !== lastSyncedAt) refresh();
      lastSyncedAt = status.lastSyncedAt;
    });
    return () => {
      appState.remove();
      unsubscribe();
    };
  }, []);

  return null;
}
