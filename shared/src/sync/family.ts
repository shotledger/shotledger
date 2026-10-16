// Families of synced rows (docs/specs/sync-family-refusal-spec.md §2.1).
// Pure: no I/O, no clock. The server's push route asks which changes of one
// push to refuse along with a refused one (§2.2); the phone's sync engine
// asks which family a queued row belongs to (§2.3).
import type { ClientChange, SyncTableName } from './protocol';

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

const keyOf = (ref: RowRef): string => `${ref.tableName}:${ref.rowId}`;

/** Adds `value` to the list under `key`. */
function link(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** Every key reachable from `start` through `edges`, `start` included. */
function reach(start: string, edges: ReadonlyMap<string, readonly string[]>): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const neighbour of edges.get(next) ?? []) {
      if (seen.has(neighbour)) continue;
      seen.add(neighbour);
      queue.push(neighbour);
    }
  }
  return seen;
}

/**
 * The indexes of `changes` to refuse as `family_refused`, given the indexes
 * the route refused as `invalid_payload` (§2.2).
 *
 * Each live change is a node; its parent is the node its ownership column
 * names, whether or not that parent is in the push (a bare id node, which
 * still links its children). From each invalid change:
 * - every live change below it, through any chain of nodes in the push;
 * - in a session family, also every live change connected to it, up and
 *   across (siblings, ancestors).
 *
 * Neither the invalid changes themselves nor tombstones (C3) are returned.
 * Rows linked only through a row absent from the push, and not named by an
 * id in it, are not seen (C4).
 */
export function familyRefusals(
  changes: readonly ClientChange[],
  invalid: ReadonlySet<number>,
): Set<number> {
  const down = new Map<string, string[]>();
  const both = new Map<string, string[]>();
  for (const change of changes) {
    if (change.deletedAt !== null) continue;
    const parent = ownerOf(change.tableName, change.payload);
    if (parent === null) continue;
    const node = keyOf(change);
    link(down, keyOf(parent), node);
    link(both, keyOf(parent), node);
    link(both, node, keyOf(parent));
  }

  const refused = new Set<string>();
  for (const index of invalid) {
    const change = changes[index];
    if (change === undefined) continue;
    const whole = familyKind(change.tableName) === 'session';
    const start = keyOf(change);
    const family = reach(start, whole ? both : down);
    // Below the invalid row only: its own node's other changes are not
    // below it. In a session family they are connected, and refused.
    if (!whole) family.delete(start);
    for (const key of family) refused.add(key);
  }

  const result = new Set<number>();
  for (const [index, change] of changes.entries()) {
    if (change.deletedAt !== null || invalid.has(index)) continue;
    if (refused.has(keyOf(change))) result.add(index);
  }
  return result;
}

/**
 * The topmost row of `ref`'s family that exists locally, walking ownership
 * edges up (`shots → series → sessions`, `licenses → firearms`). A row whose
 * parent is missing locally is its own root (§9: an orphan forms its own
 * family). `readPayload` answers undefined for a row this device lacks.
 */
export async function familyRoot(
  ref: RowRef,
  payload: unknown,
  readPayload: (ref: RowRef) => Promise<unknown>,
): Promise<RowRef> {
  let current = ref;
  let currentPayload = payload;
  for (let parent = ownerOf(current.tableName, currentPayload); parent !== null;) {
    const parentPayload = await readPayload(parent);
    if (parentPayload === undefined) break;
    current = parent;
    currentPayload = parentPayload;
    parent = ownerOf(current.tableName, currentPayload);
  }
  return current;
}
