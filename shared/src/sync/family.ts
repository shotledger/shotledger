// Families of synced rows (docs/specs/sync-family-refusal-spec.md §2.1).
// Pure: no I/O, no clock. The server's judge (judge.ts) walks them; the phone
// no longer does (Revision 3).
import type { SyncTableName } from './protocol';

/** A foreign key: `child.column` names a row of `parent`. */
export interface ForeignKeyEdge {
  child: SyncTableName;
  column: string;
  parent: SyncTableName;
}

/**
 * Ownership edges: the child belongs to its parent, so a split between them
 * orphans the child or skews the parent (C1). Written out, never inferred;
 * family.test.ts fails on any foreign key of a synced table that is in
 * neither this list nor REFERENCE_EDGES.
 */
export const OWNERSHIP_EDGES: readonly ForeignKeyEdge[] = [
  { child: 'series', column: 'session_id', parent: 'sessions' },
  { child: 'shots', column: 'series_id', parent: 'series' },
  { child: 'falt_stations', column: 'session_id', parent: 'sessions' },
  { child: 'session_tags', column: 'session_id', parent: 'sessions' },
  { child: 'licenses', column: 'firearm_id', parent: 'firearms' },
  { child: 'firearm_groups', column: 'firearm_id', parent: 'firearms' },
  { child: 'firearm_calibers', column: 'firearm_id', parent: 'firearms' },
  { child: 'maintenance_events', column: 'firearm_id', parent: 'firearms' },
  { child: 'sight_settings', column: 'firearm_id', parent: 'firearms' },
];

/**
 * References, not ownership: a refused firearm does not hold back the
 * sessions shot with it, and a refused tag does not hold back the sessions
 * it labels.
 */
export const REFERENCE_EDGES: readonly ForeignKeyEdge[] = [
  { child: 'sessions', column: 'firearm_id', parent: 'firearms' },
  { child: 'sessions', column: 'ammo_lot_id', parent: 'ammo_lots' },
  { child: 'session_tags', column: 'tag_id', parent: 'tags' },
];

/**
 * - `session`: held whole. A refused member holds back every other member,
 *   because a session's score is computed from all of them (C2).
 * - `firearm`: no orphans. A refused firearm holds back its rows; a refused
 *   row of a firearm holds back only itself.
 */
export type FamilyKind = 'session' | 'firearm';

const FAMILY_KIND: Partial<Record<SyncTableName, FamilyKind>> = {
  sessions: 'session',
  series: 'session',
  shots: 'session',
  falt_stations: 'session',
  session_tags: 'session',
  firearms: 'firearm',
  licenses: 'firearm',
  firearm_groups: 'firearm',
  firearm_calibers: 'firearm',
  maintenance_events: 'firearm',
  sight_settings: 'firearm',
};

/** `null` for a table with no family: ammo_lots, tags, settings. */
export function familyKind(tableName: SyncTableName): FamilyKind | null {
  return FAMILY_KIND[tableName] ?? null;
}

export interface RowRef {
  tableName: SyncTableName;
  rowId: string;
}

/** The row a payload's ownership column names, or null (no edge, no id). */
export function ownerOf(tableName: SyncTableName, payload: unknown): RowRef | null {
  const edge = OWNERSHIP_EDGES.find((e) => e.child === tableName);
  if (edge === undefined || typeof payload !== 'object' || payload === null) return null;
  const id = (payload as Record<string, unknown>)[edge.column];
  return typeof id === 'string' ? { tableName: edge.parent, rowId: id } : null;
}
