import { describe, expect, it } from 'vitest';

import { WEB_TABLES, type PulledTables } from '../pull';
import {
  bulkContext,
  bulkRows,
  filterRows,
  NO_FILTER,
  tagNamesOn,
  targetIds,
  type BulkRow,
} from './model';

type Row = Record<string, unknown>;

function tables(rows: Partial<Record<keyof PulledTables, Row[]>>): PulledTables {
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
  location: null,
  firearm_id: null,
  ...fields,
});

const LOGBOOK = tables({
  sessions: [
    session('a', '2026-03-01T10:00:00.000Z', { location: 'Range North', firearm_id: 'f1' }),
    session('b', '2026-06-15T10:00:00.000Z', { name: 'Club Match', firearm_id: 'fx' }),
    session('c', '2026-06-15T10:00:00.000Z'),
    session('d', '2025-12-31T10:00:00.000Z', { deleted_at: '2026-01-01T00:00:00.000Z' }),
  ],
  firearms: [
    { id: 'f1', deleted_at: null, make: 'Pardini', model: 'SP' },
    { id: 'fx', deleted_at: '2026-01-01T00:00:00.000Z', make: 'Old', model: 'Gun' },
  ],
  tags: [
    { id: 't1', deleted_at: null, name: 'KM' },
    { id: 't2', deleted_at: null, name: 'Season' },
  ],
  session_tags: [
    { id: 'l1', deleted_at: null, session_id: 'a', tag_id: 't2' },
    { id: 'l2', deleted_at: null, session_id: 'a', tag_id: 't1' },
    { id: 'l3', deleted_at: null, session_id: 'c', tag_id: 't1' },
    { id: 'l4', deleted_at: '2026-01-01T00:00:00.000Z', session_id: 'b', tag_id: 't1' },
  ],
});

const ids = (rows: readonly BulkRow[]) => rows.map((row) => row.id);

describe('the bulk list', () => {
  it('U1 live sessions only, newest first, with firearm label and tag names', () => {
    const rows = bulkRows(LOGBOOK);
    // Same start: the larger id first, so the order is total.
    expect(ids(rows)).toEqual(['c', 'b', 'a']);
    expect(rows[2]).toEqual({
      id: 'a',
      startedAt: '2026-03-01T10:00:00.000Z',
      day: '2026-03-01',
      name: 'Session a',
      disciplineId: 'spsf-precision',
      location: 'Range North',
      firearmId: 'f1',
      firearm: 'Pardini SP',
      tags: ['KM', 'Season'],
    });
    // A deleted firearm has no label; a dead link shows no tag.
    expect(rows[1]).toMatchObject({ firearmId: 'fx', firearm: null, tags: [] });
    expect(rows[0]).toMatchObject({ firearmId: null, firearm: null, location: null });
    const reversed = tables({
      sessions: [
        session('c', '2026-06-15T10:00:00.000Z'),
        session('b', '2026-06-15T10:00:00.000Z'),
      ],
    });
    expect(ids(bulkRows(reversed))).toEqual(['c', 'b']);
  });

  it('U2 From/To by local day, inclusive; Search matches name, location or a tag', () => {
    const rows = bulkRows(LOGBOOK);
    expect(ids(filterRows(rows, NO_FILTER))).toEqual(['c', 'b', 'a']);
    expect(ids(filterRows(rows, { ...NO_FILTER, from: '2026-06-15' }))).toEqual(['c', 'b']);
    expect(ids(filterRows(rows, { ...NO_FILTER, to: '2026-03-01' }))).toEqual(['a']);
    expect(ids(filterRows(rows, { ...NO_FILTER, from: '2026-03-02', to: '2026-06-14' }))).toEqual(
      [],
    );
    expect(ids(filterRows(rows, { ...NO_FILTER, search: ' club ' }))).toEqual(['b']);
    expect(ids(filterRows(rows, { ...NO_FILTER, search: 'NORTH' }))).toEqual(['a']);
    expect(ids(filterRows(rows, { ...NO_FILTER, search: 'km' }))).toEqual(['c', 'a']);
  });

  it('U3 the target is the selected sessions that are shown, in list order', () => {
    const shown = filterRows(bulkRows(LOGBOOK), { ...NO_FILTER, from: '2026-06-01' });
    expect(targetIds(new Set(['a', 'b', 'c']), shown)).toEqual(['c', 'b']);
    expect(targetIds(new Set(['a']), shown)).toEqual([]);
  });

  it('U4 Remove Tag offers the tag names on the target sessions only', () => {
    const rows = bulkRows(LOGBOOK);
    expect(tagNamesOn(rows, ['a'])).toEqual(['KM', 'Season']);
    expect(tagNamesOn(rows, ['b', 'c'])).toEqual(['KM']);
    expect(tagNamesOn(rows, [])).toEqual([]);
  });

  it('the pulled tables map onto the builder context one to one', () => {
    expect(bulkContext(LOGBOOK)).toEqual({
      sessions: LOGBOOK.sessions,
      tags: LOGBOOK.tags,
      sessionTags: LOGBOOK.session_tags,
      firearms: LOGBOOK.firearms,
      series: LOGBOOK.series,
      shots: LOGBOOK.shots,
      faltStations: LOGBOOK.falt_stations,
    });
  });
});
