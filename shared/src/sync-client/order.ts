import type { ChangeRow, SyncTableName } from '../sync/protocol';

/**
 * Foreign-key dependency order for applying pulled rows
 * (docs/specs/sync-app-spec.md §4). A parent table must precede every table
 * that references it, or the local FK constraints reject the child.
 *
 * Asserted in the test suite to be a permutation of SYNC_TABLE_NAMES, so a
 * table added to the protocol without a place here fails the suite rather
 * than silently never syncing.
 */
export const APPLY_ORDER: readonly SyncTableName[] = [
  'firearms',
  'ammo_lots',
  'tags',
  'licenses',
  'firearm_groups',
  'firearm_calibers',
  'maintenance_events',
  'sight_settings',
  'sessions',
  'series',
  'shots',
  // A fält station hangs off a session, like a series does.
  'falt_stations',
];

const ORDER_INDEX: ReadonlyMap<SyncTableName, number> = new Map(
  APPLY_ORDER.map((name, index) => [name, index]),
);

/** Position of a table in APPLY_ORDER; unknown names sort last, never crash. */
export function applyRank(tableName: SyncTableName): number {
  return ORDER_INDEX.get(tableName) ?? APPLY_ORDER.length;
}

/**
 * Stable sort: by table dependency rank, then by server `seq`. Stability
 * within a table matters — the later `seq` is the winner and must be
 * applied last.
 */
export function sortChangesForApply(changes: readonly ChangeRow[]): ChangeRow[] {
  return [...changes].sort((a, b) => {
    const byTable = applyRank(a.tableName) - applyRank(b.tableName);
    if (byTable !== 0) return byTable;
    return a.seq - b.seq;
  });
}
