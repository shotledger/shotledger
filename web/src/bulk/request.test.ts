import { describe, expect, it, vi } from 'vitest';

import { WEB_TABLES, type PulledTables, type WebTable } from '../pull';
import { bulkContext, bulkRows, filterRows, NO_FILTER } from './model';
import {
  actionOf,
  applyDeps,
  bulkRequest,
  INITIAL_FORM,
  tablesFor,
  UNCHOSEN,
  type BulkForm,
  type BulkIo,
} from './request';

type Row = Record<string, unknown>;

function tables(rows: Partial<Record<WebTable, Row[]>>): PulledTables {
  return Object.fromEntries(
    WEB_TABLES.map((name) => [
      name,
      new Map((rows[name] ?? []).map((row) => [String(row.id), row])),
    ]),
  ) as PulledTables;
}

const session = (id: string, startedAt: string, fields: Row = {}): Row => ({
  id,
  deleted_at: null,
  name: `Session ${id}`,
  discipline_id: 'spsf-precision',
  started_at: startedAt,
  location: 'Range',
  firearm_id: null,
  ...fields,
});

const LOGBOOK = tables({
  sessions: [
    session('a', '2025-05-01T10:00:00.000Z'),
    session('b', '2026-05-01T10:00:00.000Z'),
    session('c', '2026-06-01T10:00:00.000Z'),
  ],
  firearms: [
    {
      id: 'f1',
      deleted_at: null,
      make: 'A',
      model: 'B',
      round_count: 10,
    },
  ],
  tags: [
    { id: 't1', deleted_at: null, name: 'KM' },
    { id: 't2', deleted_at: '2026-01-01T00:00:00.000Z', name: 'Old' },
  ],
});

const form = (overrides: Partial<BulkForm>): BulkForm => ({ ...INITIAL_FORM, ...overrides });

function io(overrides: Partial<BulkIo> = {}) {
  let n = 0;
  return {
    currentUserId: vi.fn(() => Promise.resolve<string | null>('u1')),
    loadTables: vi.fn((_only: readonly WebTable[]) => Promise.resolve(LOGBOOK)),
    push: vi.fn(() => Promise.resolve({ kind: 'saved' as const })),
    refresh: vi.fn(() => Promise.resolve(true)),
    newId: () => `0199b000-0000-7000-8000-00000000000${(n += 1)}`,
    newChangeId: () => `00000000-0000-4000-8000-00000000000${(n += 1)}`,
    now: () => '2026-10-07T10:00:00.000Z',
    ...overrides,
  } satisfies BulkIo;
}

describe('the request the page sends (R8)', () => {
  it('R8 the action follows the form; a missing choice gives none', () => {
    expect(actionOf(form({ kind: 'addTag', tagName: ' KM ' }))).toEqual({
      kind: 'addTag',
      name: ' KM ',
    });
    expect(actionOf(form({ kind: 'removeTag', removeName: '' }))).toBeNull();
    expect(actionOf(form({ kind: 'removeTag', removeName: 'KM' }))).toEqual({
      kind: 'removeTag',
      name: 'KM',
    });
    expect(actionOf(form({ kind: 'setFirearm', firearm: UNCHOSEN }))).toBeNull();
    expect(actionOf(form({ kind: 'setFirearm', firearm: '' }))).toEqual({
      kind: 'setFirearm',
      firearmId: null,
    });
    expect(actionOf(form({ kind: 'setFirearm', firearm: 'f1' }))).toEqual({
      kind: 'setFirearm',
      firearmId: 'f1',
    });
    expect(actionOf(form({ kind: 'setLocation', location: '' }))).toEqual({
      kind: 'setLocation',
      location: '',
    });
  });

  it('R8 a firearm change re-pulls the rows its round counts come from; the others do not', () => {
    expect(tablesFor('setFirearm')).toEqual([
      'sessions',
      'tags',
      'session_tags',
      'firearms',
      'series',
      'shots',
      'falt_stations',
    ]);
    for (const kind of ['addTag', 'removeTag', 'setLocation'] as const) {
      expect(tablesFor(kind)).toEqual(['sessions', 'tags', 'session_tags', 'firearms']);
    }
  });

  it('R8 the targets are the selected sessions shown; nothing to send without both', () => {
    const shown = filterRows(bulkRows(LOGBOOK), { ...NO_FILTER, from: '2026-01-01' });
    const selected = new Set(['a', 'b', 'c']);
    expect(bulkRequest(form({ kind: 'setFirearm', firearm: 'f1' }), selected, shown)).toEqual({
      action: { kind: 'setFirearm', firearmId: 'f1' },
      targets: ['c', 'b'],
      tables: tablesFor('setFirearm'),
    });
    expect(bulkRequest(form({ tagName: 'X' }), new Set(['a']), shown)).toBeNull();
    expect(bulkRequest(form({ kind: 'removeTag' }), selected, shown)).toBeNull();
  });

  it('R8 Apply pulls the request tables and builds for its targets only', async () => {
    const shown = filterRows(bulkRows(LOGBOOK), { ...NO_FILTER, from: '2026-01-01' });
    const request = bulkRequest(
      form({ kind: 'setLocation', location: 'Elsewhere' }),
      new Set(['a', 'b', 'c']),
      shown,
    );
    const fake = io();
    const deps = applyDeps(request, fake);
    const context = await deps.loadContext();
    expect(fake.loadTables).toHaveBeenCalledWith(tablesFor('setLocation'));
    expect(context).toEqual(bulkContext(LOGBOOK));
    const built = deps.build(context);
    expect(built.ok && built.changes.map((c) => c.rowId)).toEqual(['c', 'b']);
    expect(deps.push).toBe(fake.push);
    expect(deps.currentUserId).toBe(fake.currentUserId);
    expect(deps.refresh).toBe(fake.refresh);
  });

  it('R6 the tag check pulls the tags and reads liveness', async () => {
    const fake = io();
    const deps = applyDeps(null, fake);
    expect(await deps.tagLive('t1')).toBe(true);
    expect(fake.loadTables).toHaveBeenCalledWith(['tags']);
    expect(await deps.tagLive('t2')).toBe(false);
    expect(await deps.tagLive('t9')).toBe(false);
    // A payload without deleted_at is live.
    const bare = io({
      loadTables: vi.fn(() => Promise.resolve(tables({ tags: [{ id: 't3', name: 'X' }] }))),
    });
    expect(await applyDeps(null, bare).tagLive('t3')).toBe(true);
  });
});
