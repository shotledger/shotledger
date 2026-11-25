// The refused changes Account & Sync lists, and their Discard
// (docs/specs/sync-discard-refused-spec.md §2.3). Re-read whenever the
// counts move, since the marks they count are what the list is built from.
import { rowKey, type BadRow, type SyncStatus } from '@shotledger/shared';
import { useCallback, useEffect, useState } from 'react';

import { db } from '@/db/client';
import { readBadRows } from '@/db/queries/sync-store';

import { requestDiscard } from './sync-controller';

export interface UseRefusedChanges {
  rows: BadRow[];
  failed: string[];
  busy: string | null;
  discard: (row: BadRow) => void;
}

export function useRefusedChanges(status: SyncStatus): UseRefusedChanges {
  const [rows, setRows] = useState<BadRow[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => setRows(readBadRows(db)), []);
  useEffect(reload, [reload, status.refusedCount, status.heldCount, status.lastSyncedAt]);

  const discard = (row: BadRow) => {
    const key = rowKey(row.tableName, row.rowId);
    setBusy(key);
    void requestDiscard({ tableName: row.tableName, rowId: row.rowId }).then((outcome) => {
      setBusy(null);
      setFailed((was) =>
        outcome.kind === 'failed'
          ? [...was.filter((k) => k !== key), key]
          : was.filter((k) => k !== key),
      );
      reload();
    });
  };

  return { rows, failed, busy, discard };
}
