// Mounts the app-wide sync triggers (docs/specs/sync-app-spec.md §7).
//
// "After a local write" is observed through navigation rather than by
// calling into 30 query modules: in this app a write is followed by
// `router.back()` or a navigation almost immediately, and the outbox trigger
// has already captured the row regardless — a missed notification only
// delays a push, it can never drop one. The controller debounces, so a burst
// of screen changes is one sync.
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { loadSessionTokenCache } from './client';
import { notifyLocalWrite, requestSync } from './sync-controller';

export function SyncTriggers() {
  const pathname = usePathname();

  useEffect(() => {
    // Warms the SecureStore token mirror once, then syncs if there is a
    // session. With no account this is a no-op and stays one.
    void loadSessionTokenCache().then(() => requestSync());

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void requestSync();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    notifyLocalWrite();
  }, [pathname]);

  return null;
}
