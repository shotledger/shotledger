import type { ClientChange, SyncTableName } from './protocol';

/**
 * Pure merge rules (ADR 0003, spec §3). No I/O, no clock reads — the only
 * ordering input is the server-assigned `seq` the caller provides.
 */

export interface StoredRow {
  tableName: SyncTableName;
  rowId: string;
  seq: number;
  payload: unknown;
  updatedAt: string;
  deletedAt: string | null;
}

export type MergeResult =
  { status: 'applied'; row: StoredRow } | { status: 'rejected'; reason: string };

export const REJECTED_TOMBSTONED = 'tombstoned';

/** A live row the server refused to store: not a whole, valid row of its
 * table (docs/specs/sync-payload-validation-spec.md §2.2). */
export const REJECTED_INVALID_PAYLOAD = 'invalid_payload';

/** A valid live row refused because a row of its family in the same push
 * was refused (docs/specs/sync-family-refusal-spec.md §2.2, C7). */
export const REJECTED_FAMILY = 'family_refused';

/** `lastSeq + 1` — the only place a "next" sequence number is computed. */
export function nextSequence(lastSeq: number): number {
  return lastSeq + 1;
}

/**
 * Merge one incoming change against the current stored state of the row
 * (or `undefined` if the row has never been seen), assigning it `seq`.
 *
 * - R1 create: no existing row → always applied.
 * - R2 tombstone-wins: existing row is deleted, incoming is a live edit →
 *   rejected. A tombstone is terminal; no live edit can resurrect it.
 * - R3 LWW via server order: every other case → applied. `seq` is
 *   assigned once per push, in strict server arrival order, so "last
 *   write wins" reduces to "the push that reached the server last wins" —
 *   no client timestamp is ever compared.
 */
export function mergeChange(
  existing: StoredRow | undefined,
  change: ClientChange,
  seq: number,
): MergeResult {
  const existingIsTombstoned = existing !== undefined && existing.deletedAt !== null;
  const incomingIsLiveEdit = change.deletedAt === null;

  if (existingIsTombstoned && incomingIsLiveEdit) {
    return { status: 'rejected', reason: REJECTED_TOMBSTONED };
  }

  return {
    status: 'applied',
    row: {
      tableName: change.tableName,
      rowId: change.rowId,
      seq,
      payload: change.deletedAt === null ? change.payload : null,
      updatedAt: change.updatedAt,
      deletedAt: change.deletedAt,
    },
  };
}
