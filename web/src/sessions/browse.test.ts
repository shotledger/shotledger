import { describe, expect, it } from 'vitest';

import type { PulledTables } from '../pull';
import {
  browseSessions,
  photoOwners,
  photoRefOf,
  seriesSections,
  sessionPhotoIds,
  type BrowseSeries,
} from './browse';

const table = (rows: Record<string, unknown>[]) =>
  new Map(rows.map((row) => [row.id as string, row]));

const session = (id: string, overrides: Record<string, unknown>) => ({
  id,
  name: `Session ${id}`,
  type: 'training',
  discipline_id: 'spsf-precision',
  program_id: null,
  competition_level: null,
  is_championship: 0,
  competition_name: null,
  weapon_group: null,
  shooter_class: null,
  event_id: null,
  firearm_id: null,
  ammo_lot_id: null,
  started_at: '2026-10-01T10:00:00.000Z',
  location: null,
  notes: null,
  decimal_scoring: 0,
  series_length: null,
  extra_rounds: null,
  falt_result_mode: null,
  inner_ten_count: null,
  deleted_at: null,
  ...overrides,
});

const series = (id: string, sessionId: string, position: number, overrides = {}) => ({
  id,
  session_id: sessionId,
  position,
  is_sighter: 0,
  is_final: 0,
  is_total_override: 0,
  total_override_tenths: null,
  total_override_shot_count: null,
  deleted_at: null,
  ...overrides,
});

const shot = (id: string, seriesId: string, position: number, value: number, inner = 0) => ({
  id,
  series_id: seriesId,
  position,
  value_tenths: value,
  is_inner_ten: inner,
  deleted_at: null,
});

const station = (id: string, position: number, overrides = {}) => ({
  id,
  session_id: 'falt',
  position,
  hits: 0,
  figures_hit: 0,
  figure_count: null,
  points: null,
  points_max: null,
  is_scratched: 0,
  is_shoot_off: 0,
  note: null,
  deleted_at: null,
  ...overrides,
});

function tables(): PulledTables {
  return {
    sessions: table([
      session('ring', {
        firearm_id: 'f1',
        ammo_lot_id: 'a1',
        location: 'Club range',
        notes: 'Windy',
      }),
      session('helm', {
        discipline_id: 'spsf-helmatch',
        program_id: 'spsf-helmatch',
        started_at: '2026-10-02T10:00:00.000Z',
        inner_ten_count: 3,
      }),
      session('falt', { discipline_id: 'spsf-falt', started_at: '2026-10-03T10:00:00.000Z' }),
      session('gone', { started_at: '2026-10-04T10:00:00.000Z', deleted_at: '2026-10-05' }),
    ]),
    series: table([
      series('r1', 'ring', 1, { is_sighter: 1, photo_uri: 'shotledger-photo:ph-r1' }),
      series('r2', 'ring', 2, { photo_uri: 'file:///data/user/0/photos/r2.jpg' }),
      series('r3', 'ring', 3, {
        photo_uri: 'shotledger-photo:ph-r3',
        is_total_override: 1,
        total_override_tenths: 450,
        total_override_shot_count: 5,
      }),
      series('h1', 'helm', 1, { is_sighter: 1 }),
      series('h2', 'helm', 2),
    ]),
    shots: table([
      shot('x2', 'r1', 2, 80),
      shot('x1', 'r1', 1, 90),
      shot('x3', 'r2', 1, 100, 1),
      shot('x4', 'r2', 2, 90),
      shot('x5', 'h1', 1, 100),
      shot('x6', 'h2', 1, 90),
    ]),
    falt_stations: table([
      station('st1', 1, { hits: 5, figures_hit: 3, figure_count: 4 }),
      station('st2', 2, { hits: 6, figures_hit: 6, figure_count: 6, is_scratched: 1 }),
      station('st3', 3, {
        hits: 4,
        figures_hit: 2,
        figure_count: 3,
        note: 'Wind',
        photo_uri: 'shotledger-photo:ph-st3',
      }),
    ]),
    tags: table([{ id: 't1', name: 'Club', color: null, deleted_at: null }]),
    firearms: table([{ id: 'f1', make: 'Acme', model: 'Target', deleted_at: null }]),
    firearm_groups: table([]),
    licenses: table([]),
    maintenance_events: table([]),
    ammo_lots: table([{ id: 'a1', label: 'Lot 7', deleted_at: null }]),
    session_tags: table([{ id: 'l1', session_id: 'ring', tag_id: 't1', deleted_at: null }]),
    settings: new Map(),
  };
}

describe('browseSessions', () => {
  const sessions = browseSessions(tables());
  const byId = (id: string) => sessions.find((s) => s.id === id)!;

  it('lists live sessions newest first', () => {
    expect(sessions.map((s) => s.id)).toEqual(['falt', 'helm', 'ring']);
  });

  it('orders sessions started at the same time by id, whatever order they arrive in', () => {
    const at = '2026-10-01T10:00:00.000Z';
    const rows = ['z', 'a', 'm'].map((id) => session(id, { started_at: at }));
    const later = session('b', { started_at: '2026-10-02T10:00:00.000Z' });
    for (const order of [[...rows, later], [later, ...rows].reverse()]) {
      const ids = browseSessions({ ...tables(), sessions: table(order), series: new Map() }).map(
        (s) => s.id,
      );
      expect(ids).toEqual(['b', 'a', 'm', 'z']);
    }
  });

  it('resolves the firearm, ammo lot and tags by name', () => {
    expect(byId('ring')).toMatchObject({
      firearm: 'Acme Target',
      ammoLot: 'Lot 7',
      tags: ['Club'],
      location: 'Club range',
      notes: 'Windy',
    });
  });

  it('scores a ring session as the detail screen does: sighters out, stored totals in', () => {
    const ring = byId('ring');
    expect(ring.series.map((s) => [s.position, s.totalTenths, s.shots.length])).toEqual([
      [1, 170, 2],
      [2, 190, 2],
      [3, 450, 0],
    ]);
    expect(ring.series[0]!.shots.map((s) => s.valueTenths)).toEqual([90, 80]);
    expect(ring.results).toEqual({
      beforeFinalTenths: 640,
      finalTenths: 0,
      totalTenths: 640,
      hasFinal: false,
    });
    expect(ring.seriesAverageTenths).toBe(320);
    expect(ring.innerTenCount).toBe(1);
    expect(ring.innerTenAverage).toBe(0.5);
    expect(ring.stageSubtotals).toEqual([]);
    expect(ring.falt).toBeNull();
  });

  it("gives a program's stage subtotals and prefers a stored inner-ten count", () => {
    const helm = byId('helm');
    expect(helm.series.map((s) => s.stage)).toEqual(['A', 'A']);
    expect(helm.stageSubtotals).toEqual([
      { stage: 'A', totalTenths: 90 },
      { stage: 'B', totalTenths: 0 },
      { stage: 'C', totalTenths: 0 },
    ]);
    expect(helm.innerTenCount).toBe(3);
  });

  it('gives a fält session its result over the stations that score', () => {
    const falt = byId('falt');
    expect(falt.falt).toEqual({
      mode: 'falt',
      hits: 9,
      figuresHit: 5,
      poangfaltPoints: 14,
      figureCount: 7,
      hitsPossible: 12,
    });
    expect(falt.stations.map((s) => [s.position, s.isScratched, s.note])).toEqual([
      [1, false, null],
      [2, true, null],
      [3, false, 'Wind'],
    ]);
  });

  it('tells an uploaded photo from one still on the phone and from none', () => {
    expect(byId('ring').series.map((s) => s.photo)).toEqual([
      { kind: 'uploaded', photoId: 'ph-r1' },
      { kind: 'local' },
      { kind: 'uploaded', photoId: 'ph-r3' },
    ]);
    expect(byId('helm').series.map((s) => s.photo)).toEqual([null, null]);
    expect(byId('falt').stations.map((s) => s.photo)).toEqual([
      null,
      null,
      { kind: 'uploaded', photoId: 'ph-st3' },
    ]);
  });
});

describe('photoRefOf', () => {
  it.each([
    ['shotledger-photo:abc', { kind: 'uploaded', photoId: 'abc' }],
    ['shotledger-photo:', { kind: 'local' }],
    ['file:///x.jpg', { kind: 'local' }],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%s', (uri, ref) => {
    expect(photoRefOf(uri)).toEqual(ref);
  });
});

describe('photoOwners and sessionPhotoIds', () => {
  const sessions = browseSessions(tables());
  const owners = photoOwners(sessions);

  it('indexes every uploaded photo by id with its series or station', () => {
    expect([...owners.keys()].sort()).toEqual(['ph-r1', 'ph-r3', 'ph-st3']);
    const r3 = owners.get('ph-r3')!;
    expect(r3.session.id).toBe('ring');
    expect('series' in r3 && r3.series.totalTenths).toBe(450);
    const st3 = owners.get('ph-st3')!;
    expect('station' in st3 && st3.station.position).toBe(3);
  });

  it("lists a session's uploaded photos in detail order, skipping local ones", () => {
    const byId = (id: string) => sessions.find((s) => s.id === id)!;
    expect(sessionPhotoIds(byId('ring'))).toEqual(['ph-r1', 'ph-r3']);
    expect(sessionPhotoIds(byId('helm'))).toEqual([]);
    expect(sessionPhotoIds(byId('falt'))).toEqual(['ph-st3']);
  });
});

describe('seriesSections', () => {
  const row = (position: number, isFinal: boolean): BrowseSeries => ({
    position,
    photo: null,
    isSighter: false,
    isFinal,
    isShootOff: false,
    shots: [],
    totalTenths: 0,
    stage: null,
  });
  const shape = (series: BrowseSeries[]) =>
    seriesSections(series).map((s) => [s.title, s.series.map((r) => r.position)]);

  it('leaves a session without a final untitled', () => {
    expect(shape([row(1, false), row(2, false)])).toEqual([[null, [1, 2]]]);
  });

  it('splits qualification and final', () => {
    expect(shape([row(1, false), row(2, true)])).toEqual([
      ['main', [1]],
      ['final', [2]],
    ]);
  });

  it('shows no empty qualification when only final series exist', () => {
    expect(shape([row(1, true)])).toEqual([['final', [1]]]);
  });

  it('gives no section for no series', () => {
    expect(shape([])).toEqual([]);
  });
});
