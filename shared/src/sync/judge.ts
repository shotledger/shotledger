// The server's verdict on one push, from one snapshot of the user's stored
// rows and refusal records (docs/specs/sync-family-refusal-spec.md §11.4,
// §11.5). Pure: no I/O, no clock. The route reads the snapshot, calls
// judgePush, and writes the plan in one D1 batch.
import type { ClientChange, SyncTableName } from './protocol';
import { familyKind, ownerOf, type RowRef } from './family';

export type RefusalReason = 'invalid_payload' | 'family_refused';

/** One `sync_refusals` row, without its payload. */
export interface RefusalRecord {
  tableName: SyncTableName;
  rowId: string;
  reason: RefusalReason;
  parent: RowRef | null;
  arrival: number;
  /** The blocker stored with a waiting record; null for a bad row. */
  blocker: RowRef | null;
}

/** One stored row, as the walk reads it from `sync_rows`. */
export interface StoredLink {
  tableName: SyncTableName;
  rowId: string;
  deleted: boolean;
  parent: RowRef | null;
}

export interface PushSnapshot {
  /** `sync_sequence.state_rev` as read first; the push arrives at `stateRev + 1`. */
  stateRev: number;
  /** The push's `clientChangeId`s that already have an idempotency record. */
  recorded: ReadonlySet<string>;
  records: readonly RefusalRecord[];
  stored: readonly StoredLink[];
}

export type Verdict =
  | { kind: 'duplicate' }
  | { kind: 'applied' }
  | { kind: 'tombstoned' }
  | { kind: 'invalid_payload'; parent: RowRef | null }
  | { kind: 'family_refused'; parent: RowRef | null; blocker: RowRef };

export interface PushPlan {
  /** This push's arrival: `stateRev + 1`. */
  arrival: number;
  verdicts: Verdict[];
  /** Waiting records the blocked rule no longer holds for, in apply order. */
  release: RowRef[];
  /** Bad records that are inert after this push, to delete. */
  inert: RowRef[];
  /**
   * Waiting records still blocked whose blocker changes, with their blocker
   * after this push. A record already stored with it is left out, so a push
   * that touches no blocked family rewrites nothing (round 5, V5-3).
   */
  blockers: { row: RowRef; blocker: RowRef }[];
  /** Waiting records turned into bad rows by re-validation. */
  demoted: RowRef[];
}

const keyOf = (ref: RowRef): string => `${ref.tableName}:${ref.rowId}`;
const refOf = (row: RowRef): RowRef => ({ tableName: row.tableName, rowId: row.rowId });

/** The parent a live payload's ownership column names, when it is a non-empty string. */
function readableParent(change: ClientChange): RowRef | null {
  const parent = ownerOf(change.tableName, change.payload);
  return parent !== null && parent.rowId !== '' ? parent : null;
}

/** Code-unit order, as SQLite's default BINARY collation sorts text. */
const binary = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Oldest first, then by table, then by id: the blocker order and the release
 * order. It matches the batch's `ORDER BY arrival, table_name, row_id`.
 */
function byArrival(a: { arrival: number; ref: RowRef }, b: { arrival: number; ref: RowRef }) {
  return (
    a.arrival - b.arrival ||
    binary(a.ref.tableName, b.ref.tableName) ||
    binary(a.ref.rowId, b.ref.rowId)
  );
}

type ChangeKind = 'duplicate' | 'tombstone' | 'tombstoned' | 'invalid' | 'live';

/** How each change counts, in push order (§11.4, precedence). */
function classify(
  changes: readonly ClientChange[],
  invalid: ReadonlySet<number>,
  recorded: ReadonlySet<string>,
  storedDeleted: (key: string) => boolean,
): { kinds: ChangeKind[]; tombstoned: Set<string> } {
  const seen = new Set(recorded);
  const pushTombstones = new Set<string>();
  const kinds = changes.map((change, index): ChangeKind => {
    if (seen.has(change.clientChangeId)) return 'duplicate';
    seen.add(change.clientChangeId);
    const key = keyOf(change);
    if (change.deletedAt !== null) {
      pushTombstones.add(key);
      return 'tombstone';
    }
    if (storedDeleted(key) || pushTombstones.has(key)) return 'tombstoned';
    return invalid.has(index) ? 'invalid' : 'live';
  });
  return { kinds, tombstoned: pushTombstones };
}

/**
 * The verdict on every change of one push, and what the batch does to the
 * refusal records, judged on the state this push leaves (§11.4, §11.5).
 * `demoted` names waiting records whose payload failed re-validation; they
 * count as bad rows at their own arrival.
 */
export function judgePush(
  changes: readonly ClientChange[],
  invalid: ReadonlySet<number>,
  snapshot: PushSnapshot,
  demoted: ReadonlySet<string> = new Set(),
): PushPlan {
  const arrival = snapshot.stateRev + 1;
  const records = new Map(snapshot.records.map((r) => [keyOf(r), r]));
  const stored = new Map(snapshot.stored.map((s) => [keyOf(s), s]));
  const { kinds, tombstoned } = classify(
    changes,
    invalid,
    snapshot.recorded,
    (key) => stored.get(key)?.deleted === true,
  );

  // The latest change of each row that this push makes (duplicates make none).
  const latest = new Map<string, number>();
  changes.forEach((change, index) => {
    if (kinds[index] !== 'duplicate') latest.set(keyOf(change), index);
  });
  const pushKind = (key: string): ChangeKind | undefined => {
    const index = latest.get(key);
    return index === undefined ? undefined : kinds[index];
  };

  /** Whether this push writes the row, so its record follows this push (§11.5's table). */
  const changed = (key: string): boolean => {
    const kind = pushKind(key);
    return kind !== undefined && kind !== 'tombstoned';
  };
  const deleted = (key: string): boolean =>
    stored.get(key)?.deleted === true || tombstoned.has(key);

  const link = (key: string): RowRef | null => {
    const index = latest.get(key);
    const change = index === undefined ? undefined : changes[index];
    const own = change === undefined || change.deletedAt !== null ? null : readableParent(change);
    return own ?? records.get(key)?.parent ?? stored.get(key)?.parent ?? null;
  };

  const root = (key: string): string => {
    let current = key;
    for (let parent = link(current); parent !== null && !deleted(current); parent = link(current)) {
      current = keyOf(parent);
    }
    return current;
  };

  // The bad rows after this push: a bad row's latest version is invalid.
  const bad: { ref: RowRef; arrival: number; key: string }[] = [];
  for (const record of snapshot.records) {
    const key = keyOf(record);
    const isBad = record.reason === 'invalid_payload' || demoted.has(key);
    if (isBad && !changed(key) && !deleted(key)) {
      bad.push({ ref: refOf(record), arrival: record.arrival, key });
    }
  }
  for (const [key, index] of latest) {
    if (kinds[index] === 'invalid') bad.push({ ref: refOf(changes[index]!), arrival, key });
  }

  const inert: RowRef[] = [];
  const sessionBlockers = new Map<string, { ref: RowRef; arrival: number }>();
  const firearmBlockers = new Map<string, RowRef>();
  for (const row of bad) {
    const top = root(row.key);
    if (deleted(top)) {
      inert.push(row.ref);
      continue;
    }
    // A bad firearm blocks its rows; any other bad firearm-family row blocks
    // only itself (C2), so it is indexed nowhere.
    if (row.ref.tableName === 'firearms') firearmBlockers.set(row.key, row.ref);
    if (familyKind(row.ref.tableName) !== 'session') continue;
    const current = sessionBlockers.get(top);
    if (current === undefined || byArrival(row, current) < 0) sessionBlockers.set(top, row);
  }
  // A bad record whose own row is tombstoned blocks nothing and is deleted.
  for (const record of snapshot.records) {
    const key = keyOf(record);
    const isBad = record.reason === 'invalid_payload' || demoted.has(key);
    if (isBad && !changed(key) && deleted(key)) inert.push(refOf(record));
  }

  /** §11.4's blocked rule: the bad row that blocks `ref`, or null. */
  const blockerOf = (ref: RowRef): RowRef | null => {
    const key = keyOf(ref);
    switch (familyKind(ref.tableName)) {
      case 'session':
        return sessionBlockers.get(root(key))?.ref ?? null;
      case 'firearm': {
        const firearm = ref.tableName === 'firearms' ? null : link(key);
        return firearm === null ? null : (firearmBlockers.get(keyOf(firearm)) ?? null);
      }
      case null:
        return null;
    }
  };

  const verdicts = changes.map((change, index): Verdict => {
    switch (kinds[index]!) {
      case 'duplicate':
        return { kind: 'duplicate' };
      case 'tombstone':
        return { kind: 'applied' };
      case 'tombstoned':
        return { kind: 'tombstoned' };
      case 'invalid':
        return { kind: 'invalid_payload', parent: link(keyOf(change)) };
      case 'live': {
        const blocker = blockerOf(change);
        return blocker === null
          ? { kind: 'applied' }
          : { kind: 'family_refused', parent: link(keyOf(change)), blocker };
      }
    }
  });

  const release: { ref: RowRef; arrival: number }[] = [];
  const blockers: PushPlan['blockers'] = [];
  for (const record of snapshot.records) {
    const key = keyOf(record);
    if (record.reason !== 'family_refused' || demoted.has(key) || changed(key)) continue;
    const blocker = blockerOf(record);
    if (blocker === null) release.push({ ref: refOf(record), arrival: record.arrival });
    else if (record.blocker === null || keyOf(record.blocker) !== keyOf(blocker)) {
      blockers.push({ row: refOf(record), blocker });
    }
  }

  return {
    arrival,
    verdicts,
    release: release.sort(byArrival).map((r) => r.ref),
    inert,
    blockers,
    demoted: snapshot.records
      .filter((r) => r.reason === 'family_refused' && demoted.has(keyOf(r)))
      .map(refOf),
  };
}

/**
 * The indexes of `changes` refused as `family_refused` when the push is
 * judged on its own, with nothing stored or remembered (§2.2's within-push
 * walk). The route judges with the snapshot; this is the same judge.
 */
export function familyRefusals(
  changes: readonly ClientChange[],
  invalid: ReadonlySet<number>,
): Set<number> {
  const empty: PushSnapshot = { stateRev: 0, recorded: new Set(), records: [], stored: [] };
  const { verdicts } = judgePush(changes, invalid, empty);
  return new Set(verdicts.flatMap((v, index) => (v.kind === 'family_refused' ? [index] : [])));
}
