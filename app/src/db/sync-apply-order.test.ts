// APPLY_ORDER (shared/src/sync-client/order.ts) must put every parent table
// before its children, or the local FK constraints reject pulled rows. The
// edges are read from schema.ts itself so the check cannot drift from it.
import { APPLY_ORDER, SYNC_TABLE_NAMES, type SyncTableName } from '@shotledger/shared';
import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';

const tables = (Object.values(schema) as unknown[]).filter((value): value is SQLiteTable =>
  is(value, SQLiteTable),
);

const edges: { parent: string; child: string }[] = tables.flatMap((table) =>
  getTableConfig(table).foreignKeys.map((fk) => ({
    parent: getTableName(fk.reference().foreignTable),
    child: getTableName(table),
  })),
);

const synced = new Set<string>(SYNC_TABLE_NAMES);

// Local-only tables that reference synced ones. They never arrive in a pull,
// so their place relative to APPLY_ORDER does not matter.
const LOCAL_ONLY_CHILDREN = ['shot_marks', 'training_samples'];

describe('APPLY_ORDER against the schema foreign keys', () => {
  it('reads a non-trivial edge set out of the schema', () => {
    // Guards the derivation itself: an empty edge list would pass every check below.
    expect(edges).toContainEqual({ parent: 'firearms', child: 'firearm_calibers' });
    expect(edges).toContainEqual({ parent: 'sessions', child: 'falt_stations' });
    // P3 (sync-tags-settings spec): the link table's two parents.
    expect(edges).toContainEqual({ parent: 'sessions', child: 'session_tags' });
    expect(edges).toContainEqual({ parent: 'tags', child: 'session_tags' });
  });

  it('places every synced parent before each synced table that references it', () => {
    const rank = (name: string) => APPLY_ORDER.indexOf(name as SyncTableName);
    const syncedEdges = edges.filter((e) => synced.has(e.child));
    expect(syncedEdges.length).toBeGreaterThan(0);
    for (const { parent, child } of syncedEdges) {
      expect(rank(parent), `${parent} -> ${child}`).toBeGreaterThanOrEqual(0);
      expect(rank(parent), `${parent} -> ${child}`).toBeLessThan(rank(child));
    }
  });

  it('has no synced table referencing a local-only one', () => {
    // A pulled row whose parent never syncs would fail its FK on every device.
    const dangling = edges.filter((e) => synced.has(e.child) && !synced.has(e.parent));
    expect(dangling).toEqual([]);
  });

  it('lists exactly the local-only tables that reference synced rows', () => {
    const localChildren = [
      ...new Set(edges.filter((e) => !synced.has(e.child)).map((e) => e.child)),
    ].sort();
    expect(localChildren).toEqual(LOCAL_ONLY_CHILDREN);
  });
});
