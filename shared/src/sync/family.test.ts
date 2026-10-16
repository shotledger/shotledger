// docs/specs/sync-family-refusal-spec.md §2.1–§2.2: the pure family rules.
// F1–F11 against the real Worker live in backend/test/sync-family-refusal.spec.ts;
// these pin the function's edges.
import { describe, expect, it } from 'vitest';

import {
  familyKind,
  familyRefusals,
  familyRoot,
  OWNERSHIP_EDGES,
  ownerOf,
  REFERENCE_EDGES,
  type RowRef,
} from './family';
import type { ClientChange, SyncTableName } from './protocol';

let n = 0;
function live(tableName: SyncTableName, rowId: string, payload: unknown = {}): ClientChange {
  n += 1;
  return {
    clientChangeId: `c${n}`,
    tableName,
    rowId,
    payload,
    deletedAt: null,
    updatedAt: 'u',
  };
}
const dead = (tableName: SyncTableName, rowId: string): ClientChange => ({
  ...live(tableName, rowId, null),
  deletedAt: 'd',
});
const session = (id: string) => live('sessions', id);
const series = (id: string, sessionId: string) => live('series', id, { session_id: sessionId });
const shot = (id: string, seriesId: string) => live('shots', id, { series_id: seriesId });
const firearm = (id: string) => live('firearms', id);
const license = (id: string, firearmId: string) => live('licenses', id, { firearm_id: firearmId });

const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);

describe('familyKind', () => {
  it.each<[SyncTableName, string | null]>([
    ['sessions', 'session'],
    ['series', 'session'],
    ['shots', 'session'],
    ['falt_stations', 'session'],
    ['session_tags', 'session'],
    ['firearms', 'firearm'],
    ['licenses', 'firearm'],
    ['firearm_groups', 'firearm'],
    ['firearm_calibers', 'firearm'],
    ['maintenance_events', 'firearm'],
    ['sight_settings', 'firearm'],
    ['ammo_lots', null],
    ['tags', null],
    ['settings', null],
  ])('%s is %s', (tableName, kind) => {
    expect(familyKind(tableName)).toBe(kind);
  });
});

describe('the edge lists', () => {
  it('pin every ownership and reference edge (§2.1)', () => {
    expect(OWNERSHIP_EDGES).toEqual([
      { child: 'series', column: 'session_id', parent: 'sessions' },
      { child: 'shots', column: 'series_id', parent: 'series' },
      { child: 'falt_stations', column: 'session_id', parent: 'sessions' },
      { child: 'session_tags', column: 'session_id', parent: 'sessions' },
      { child: 'licenses', column: 'firearm_id', parent: 'firearms' },
      { child: 'firearm_groups', column: 'firearm_id', parent: 'firearms' },
      { child: 'firearm_calibers', column: 'firearm_id', parent: 'firearms' },
      { child: 'maintenance_events', column: 'firearm_id', parent: 'firearms' },
      { child: 'sight_settings', column: 'firearm_id', parent: 'firearms' },
    ]);
    expect(REFERENCE_EDGES).toEqual([
      { child: 'sessions', column: 'firearm_id', parent: 'firearms' },
      { child: 'sessions', column: 'ammo_lot_id', parent: 'ammo_lots' },
      { child: 'session_tags', column: 'tag_id', parent: 'tags' },
    ]);
  });
});

describe('ownerOf', () => {
  it('names the parent its ownership column holds', () => {
    expect(ownerOf('shots', { series_id: 'r1' })).toEqual({ tableName: 'series', rowId: 'r1' });
    expect(ownerOf('session_tags', { session_id: 's1', tag_id: 't1' })).toEqual({
      tableName: 'sessions',
      rowId: 's1',
    });
  });

  it('is null for a table with no ownership edge, even with a reference column', () => {
    expect(ownerOf('sessions', { firearm_id: 'f1' })).toBeNull();
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'r1'],
    ['a missing column', {}],
    ['a null id', { series_id: null }],
    ['a numeric id', { series_id: 7 }],
  ])('is null for a payload that is %s', (_label, payload) => {
    expect(ownerOf('shots', payload)).toBeNull();
  });
});

describe('familyRefusals', () => {
  it('refuses nothing when nothing is invalid', () => {
    expect(familyRefusals([session('s1'), series('r1', 's1')], new Set())).toEqual(new Set());
  });

  it('refuses a session family up, across and down from a refused series', () => {
    const changes = [session('s1'), series('r1', 's1'), series('r2', 's1'), shot('t1', 'r2')];
    expect(sorted(familyRefusals(changes, new Set([1])))).toEqual([0, 2, 3]);
  });

  it('links siblings through a parent that is not in the push', () => {
    const changes = [shot('t1', 'r1'), shot('t2', 'r1'), shot('t3', 'r2')];
    expect(sorted(familyRefusals(changes, new Set([0])))).toEqual([1]);
  });

  it('refuses another change of the same session row with it', () => {
    const changes = [session('s1'), session('s1')];
    expect(sorted(familyRefusals(changes, new Set([0])))).toEqual([1]);
  });

  it('refuses only below a refused firearm, never a sibling firearm row', () => {
    const changes = [firearm('f1'), license('l1', 'f1'), license('l2', 'f1'), firearm('f2')];
    expect(sorted(familyRefusals(changes, new Set([0])))).toEqual([1, 2]);
    expect(sorted(familyRefusals(changes, new Set([1])))).toEqual([]);
  });

  it('does not refuse another change of the same firearm row: it is not below it', () => {
    const changes = [firearm('f1'), firearm('f1'), license('l1', 'f1')];
    expect(sorted(familyRefusals(changes, new Set([0])))).toEqual([2]);
  });

  it('a table with no family refuses nothing else', () => {
    const changes = [live('tags', 'g1'), live('session_tags', 'st', { tag_id: 'g1' })];
    expect(sorted(familyRefusals(changes, new Set([0])))).toEqual([]);
  });

  it('never returns a tombstone, and a tombstone links nothing', () => {
    const changes = [session('s1'), dead('series', 'r1'), shot('t1', 'r1'), series('r2', 's1')];
    // r1's tombstone carries no session_id, so t1 is linked to r1 only.
    expect(sorted(familyRefusals(changes, new Set([0])))).toEqual([3]);
    expect(sorted(familyRefusals(changes, new Set([2])))).toEqual([]);
  });

  it('never returns an invalid change, even one in another invalid change’s family', () => {
    const changes = [session('s1'), series('r1', 's1'), shot('t1', 'r1')];
    expect(sorted(familyRefusals(changes, new Set([0, 2])))).toEqual([1]);
  });

  it('ignores an index past the end of the push', () => {
    expect(familyRefusals([session('s1')], new Set([5]))).toEqual(new Set());
  });

  it('keeps two sessions apart', () => {
    const changes = [session('s1'), series('r1', 's1'), session('s2'), series('r2', 's2')];
    expect(sorted(familyRefusals(changes, new Set([1])))).toEqual([0]);
  });
});

describe('familyRoot', () => {
  const local = new Map<string, unknown>([
    ['sessions:s1', {}],
    ['series:r1', { session_id: 's1' }],
    ['series:r9', { session_id: 'gone' }],
    ['firearms:f1', {}],
  ]);
  const reads: string[] = [];
  const readPayload = async (ref: RowRef) => {
    reads.push(`${ref.tableName}:${ref.rowId}`);
    return local.get(`${ref.tableName}:${ref.rowId}`);
  };

  it('walks a shot up to its session', async () => {
    reads.length = 0;
    await expect(
      familyRoot({ tableName: 'shots', rowId: 't1' }, { series_id: 'r1' }, readPayload),
    ).resolves.toEqual({ tableName: 'sessions', rowId: 's1' });
    expect(reads).toEqual(['series:r1', 'sessions:s1']);
  });

  it('stops at the topmost row that exists locally', async () => {
    await expect(
      familyRoot({ tableName: 'shots', rowId: 't2' }, { series_id: 'r9' }, readPayload),
    ).resolves.toEqual({ tableName: 'series', rowId: 'r9' });
    await expect(
      familyRoot({ tableName: 'shots', rowId: 't3' }, { series_id: 'nowhere' }, readPayload),
    ).resolves.toEqual({ tableName: 'shots', rowId: 't3' });
  });

  it('is the row itself for a root table, without reading anything', async () => {
    reads.length = 0;
    await expect(
      familyRoot({ tableName: 'sessions', rowId: 's1' }, {}, readPayload),
    ).resolves.toEqual({ tableName: 'sessions', rowId: 's1' });
    expect(reads).toEqual([]);
  });

  it('walks a license to its firearm', async () => {
    await expect(
      familyRoot({ tableName: 'licenses', rowId: 'l1' }, { firearm_id: 'f1' }, readPayload),
    ).resolves.toEqual({ tableName: 'firearms', rowId: 'f1' });
  });
});
