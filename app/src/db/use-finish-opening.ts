// Runs finishOpeningDatabase once migrations have succeeded, for both
// migration gates (docs/specs/phone-foreign-keys-spec.md FK3). Computed
// during render rather than in an effect: it is synchronous, idempotent (a
// second run sweeps nothing and the pragma is already on), and the gate must
// not render the app before it.
import { useMemo } from 'react';

import { finishOpeningDatabase } from './foreign-keys';
import type { Database } from './types';

export function useFinishOpening(
  db: Database,
  migrated: boolean,
): { done: boolean; error: Error | null } {
  return useMemo(() => {
    if (!migrated) return { done: false, error: null };
    try {
      const moved = finishOpeningDatabase(db);
      if (__DEV__ && moved > 0) {
        console.info(`[db] moved ${moved} row(s) without a parent to sync_pending_rows`);
      }
      return { done: true, error: null };
    } catch (err: unknown) {
      return { done: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, [db, migrated]);
}
