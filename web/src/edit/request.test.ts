import type { ClientChange } from '@shotledger/shared/src/sync';
import { openedSession } from '@shotledger/shared/src/sync-client/session-edit';
import { describe, expect, it, vi } from 'vitest';

import type { PulledTables, WebTable } from '../pull';
import { EDIT_TABLES, editContext } from './model';
import { deleteDeps, deletePreview, saveDeps, type EditIo } from './request';

type Row = Record<string, unknown>;
const OLD = '2026-01-01T00:00:00.000Z';
const NOW = '2026-10-12T10:00:00.000Z';
const common = (id: string, deletedAt: string | null = null) => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: deletedAt,
});
const byId = (...rows: Row[]) => new Map(rows.map((row) => [row.id as string, row]));

/** s1 on f1: one series of 3 shots and 2 extra rounds. s2 on the deleted fx. s3 on f1, nothing shot. */
function tables(): PulledTables {
  const empty = () => new Map<string, Row>();
  return {
    sessions: byId(
      {
        ...common('s1'),
        name: 'S1',
        type: 'training',
        discipline_id: 'spsf-precision',
        firearm_id: 'f1',
        extra_rounds: 2,
      },
      { ...common('s2'), name: 'S2', discipline_id: 'spsf-precision', firearm_id: 'fx' },
      { ...common('s3'), name: 'S3', discipline_id: 'spsf-precision', firearm_id: 'f1' },
      { ...common('s4', OLD), name: 'S4', discipline_id: 'spsf-precision', firearm_id: 'f1' },
    ),
    series: byId({ ...common('r1'), session_id: 's1', position: 1, is_sighter: 0, is_final: 0 }),
    shots: byId(
      ...['a', 'b', 'c'].map((id, i) => ({
        ...common(id),
        series_id: 'r1',
        position: i + 1,
        value_tenths: 90,
        is_inner_ten: 0,
      })),
    ),
    falt_stations: empty(),
    tags: empty(),
    firearms: byId(
      { ...common('f1'), make: 'Make', model: 'One', round_count: 50 },
      { ...common('fx', OLD), make: 'Make', model: 'Gone', round_count: 9 },
    ),
    firearm_groups: empty(),
    licenses: empty(),
    maintenance_events: empty(),
    ammo_lots: empty(),
    session_tags: empty(),
    settings: empty(),
  };
}

function io(): EditIo & { loadTables: ReturnType<typeof vi.fn> } {
  let n = 0;
  return {
    currentUserId: vi.fn(async () => 'u1'),
    loadTables: vi.fn(async (_only: readonly WebTable[]) => tables()),
    push: vi.fn(async () => ({ kind: 'saved' as const })),
    refresh: vi.fn(async () => true),
    newId: () => `id-${(n += 1)}`,
    newChangeId: () => `change-${(n += 1)}`,
    now: () => NOW,
  };
}

describe('saveDeps and deleteDeps', () => {
  it('pull the edit tables afresh and build from them', async () => {
    const live = io();
    const opened = openedSession('s1', editContext(tables()))!;
    const deps = saveDeps(live, opened, {
      sessionId: 's1',
      fields: { location: 'Range B' },
      series: [],
    });
    const fresh = await deps.loadContext();
    expect(live.loadTables).toHaveBeenCalledWith(EDIT_TABLES);
    const built = deps.build(fresh);
    expect(built).toMatchObject({ ok: true, moved: [] });
    if (!built.ok) throw new Error('expected ok');
    expect(built.changes).toEqual([
      expect.objectContaining({
        tableName: 'sessions',
        rowId: 's1',
        updatedAt: NOW,
        payload: expect.objectContaining({ location: 'Range B' }) as unknown,
      }),
    ]);
    expect(deps.currentUserId).toBe(live.currentUserId);
    expect(deps.push).toBe(live.push);
    expect(deps.refresh).toBe(live.refresh);
  });

  it('delete builds the tombstones and the counter move', async () => {
    const live = io();
    const deps = deleteDeps(live, tables(), 's1');
    const built = deps.build(await deps.loadContext());
    if (!built.ok) throw new Error('expected ok');
    expect(built.changes.map((c: ClientChange) => [c.tableName, c.rowId])).toEqual([
      ['firearms', 'f1'],
      ['sessions', 's1'],
      ['series', 'r1'],
      ['shots', 'a'],
      ['shots', 'b'],
      ['shots', 'c'],
    ]);
    expect(built.changes[0]!.payload).toMatchObject({
      round_count: 45,
    });
  });
});

describe('U10 deleteDeps builds against the session as the page showed it (R10)', () => {
  it('a series added on another device since the page pulled → stale, nothing built', async () => {
    const live = io();
    const fresh = tables();
    fresh.series.set('r2', { ...common('r2'), session_id: 's1', position: 2, is_sighter: 0 });
    live.loadTables.mockResolvedValue(fresh);
    // The page's tables are what the confirmation showed; the fresh pull differs.
    const deps = deleteDeps(live, tables(), 's1');
    expect(deps.build(await deps.loadContext())).toEqual({
      ok: false,
      errors: [{ kind: 'stale' }],
    });
  });
});

describe('deleteDeps with nothing to show', () => {
  it('a session the page does not hold live builds nothing: gone', async () => {
    const live = io();
    for (const id of ['s4', 'nope']) {
      const deps = deleteDeps(live, tables(), id);
      expect(deps.build(await deps.loadContext())).toEqual({
        ok: false,
        errors: [{ kind: 'gone' }],
      });
    }
  });
});

describe('deletePreview', () => {
  it('names the live firearm and the rounds its count loses (shots and extra rounds)', () => {
    expect(deletePreview(tables(), 's1')).toEqual({ firearmId: 'f1', rounds: 5 });
  });

  it('no firearm to name when it is deleted, absent, or nothing was shot', () => {
    expect(deletePreview(tables(), 's2')).toEqual({ firearmId: null, rounds: 0 });
    const shot = tables();
    shot.series.set('r2', { ...common('r2'), session_id: 's2', position: 1 });
    shot.shots.set('d', { ...common('d'), series_id: 'r2', position: 1, value_tenths: 90 });
    expect(deletePreview(shot, 's2')).toEqual({ firearmId: null, rounds: 1 });
    expect(deletePreview(tables(), 's3')).toEqual({ firearmId: null, rounds: 0 });
    const t = tables();
    t.sessions.set('s5', { ...common('s5'), discipline_id: 'spsf-precision', extra_rounds: 4 });
    expect(deletePreview(t, 's5')).toEqual({ firearmId: null, rounds: 4 });
  });

  it('nothing for a session that is not live', () => {
    expect(deletePreview(tables(), 's4')).toBeNull();
    expect(deletePreview(tables(), 'nope')).toBeNull();
  });
});
