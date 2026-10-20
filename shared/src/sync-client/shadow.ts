import type { ChangeRow, RefusalEntry, SyncTableName } from '../sync/protocol';
import type { MarkUpdate, OutboxEntry, RefusalMark } from './ports';

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

/**
 * Which pulled changes this device applies, and which marks survive them
 * (docs/specs/sync-family-refusal-spec.md §11.6). A queued entry shadows
 * anything, as above. A mark means the server holds a version of this row
 * that has not landed: a tombstone still wins (R2), and a live change wins
 * when it arrived at the server no earlier than the held version; an older
 * one, such as this device's own echo, is shadowed. Arrivals are the
 * server's, never a clock.
 */
export function shadowPull(
  changes: readonly ChangeRow[],
  pendingKeys: ReadonlySet<string>,
  marks: readonly RefusalMark[],
): { applicable: ChangeRow[]; marks: RefusalMark[]; shadowed: number } {
  const byKey = new Map(marks.map((mark) => [rowKey(mark.tableName, mark.rowId), mark]));
  const applicable: ChangeRow[] = [];
  for (const change of changes) {
    const key = rowKey(change.tableName, change.rowId);
    if (pendingKeys.has(key)) continue;
    const mark = byKey.get(key);
    if (mark !== undefined) {
      if (change.deletedAt === null && (change.arrival ?? 0) < mark.arrival) continue;
      byKey.delete(key);
    }
    applicable.push(change);
  }
  return {
    applicable,
    marks: [...byKey.values()],
    shadowed: changes.length - applicable.length,
  };
}

/** The marks a pull's `refusals` list stands for (§11.6). */
export function marksFromRefusals(entries: readonly RefusalEntry[]): RefusalMark[] {
  return entries.map((entry) => ({
    tableName: entry.tableName,
    rowId: entry.rowId,
    kind: entry.reason === 'invalid_payload' ? 'invalid' : 'waiting',
    arrival: entry.arrival,
    blocker: entry.blocker,
  }));
}

/**
 * The two Account & Sync counts (spec §11.6): refused changes (`invalid`
 * marks) and changes waiting on one (`waiting` marks). The phone counts its
 * marks; the web counts the marks of its pull's `refusals`.
 */
export function countMarks(marks: readonly Pick<RefusalMark, 'kind'>[]): {
  invalid: number;
  waiting: number;
} {
  const invalid = marks.filter((m) => m.kind === 'invalid').length;
  return { invalid, waiting: marks.length - invalid };
}

/**
 * An ack's mark update (docs/specs/sync-family-refusal-spec.md §11.6): a set
 * keeps the greater arrival, and a drop spares a mark that arrived after the
 * ack's change, which only a later push or another device can have caused.
 */
export function applyMarkUpdate(marks: readonly RefusalMark[], update: MarkUpdate): RefusalMark[] {
  const target = 'set' in update ? update.set : update.drop;
  const key = rowKey(target.tableName, target.rowId);
  const old = marks.find((mark) => rowKey(mark.tableName, mark.rowId) === key);
  const others = marks.filter((mark) => mark !== old);
  const upTo = 'set' in update ? update.set.arrival : update.upTo;
  if (old !== undefined && old.arrival > upTo) return [...others, old];
  return 'set' in update ? [...others, update.set] : others;
}
