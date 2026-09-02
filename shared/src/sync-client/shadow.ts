import type { ChangeRow, SyncTableName } from '../sync/protocol';
import type { OutboxEntry } from './ports';

/**
 * Local-edit shadowing (docs/specs/sync-app-spec.md §5a).
 *
 * The cycle pulls before it pushes, so a page can carry the server's *older*
 * state for a row this device has edited but not yet sent. Writing it would
 * overwrite the user's edit, and the push that follows would then send the
 * overwritten value back up — the edit would be gone from both devices, with
 * no error anywhere. So a pulled change for a row with a pending outbox entry
 * is dropped: the local version stays, is pushed later in the same cycle, and
 * the server's own last-write-wins makes it the winner for everyone.
 */

export function rowKey(tableName: SyncTableName, rowId: string): string {
  return `${tableName}:${rowId}`;
}

export function filterShadowedChanges(
  changes: readonly ChangeRow[],
  pendingKeys: ReadonlySet<string>,
): ChangeRow[] {
  return changes.filter((change) => !pendingKeys.has(rowKey(change.tableName, change.rowId)));
}

/**
 * The local consequence of a `rejected` ack. The server rejects exactly one
 * thing — a live edit over a row it holds a tombstone for — so the honest
 * local outcome is to tombstone the row here too.
 *
 * It cannot simply be left for the next pull: the cursor moved past that
 * tombstone during the pull that shadowed it, so nothing would ever deliver
 * it again.
 */
export function tombstoneFromRejection(entry: OutboxEntry, deletedAt: string): ChangeRow {
  return {
    tableName: entry.tableName,
    rowId: entry.rowId,
    // Local-only: applyChanges ignores seq, and this row never goes back on
    // the wire. 1 keeps it a valid positive int for the schema.
    seq: 1,
    payload: null,
    deletedAt,
    updatedAt: deletedAt,
  };
}
