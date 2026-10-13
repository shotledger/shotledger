import { describe, expect, it } from 'vitest';

import type { PulledTables } from '../pull';
import {
  addRow,
  canMarkSighter,
  EDIT_TABLES,
  editContext,
  localDateTime,
  openForm,
  setRow,
  toDraft,
  type EditForm,
} from './model';

type Row = Record<string, unknown>;
const OLD = '2026-01-01T00:00:00.000Z';
const common = (id: string) => ({ id, created_at: OLD, updated_at: OLD, deleted_at: null });
const byId = (...rows: Row[]) => new Map(rows.map((row) => [row.id as string, row]));

const session = (id: string, fields: Row = {}): Row => ({
  ...common(id),
  name: `Session ${id}`,
  type: 'training',
  kind: 'series',
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
  // 08:30 UTC is 10:30 in Stockholm in May (vitest runs in Europe/Stockholm).
  started_at: '2026-05-01T08:30:00.000Z',
  location: null,
  notes: null,
  decimal_scoring: 0,
  series_length: null,
  extra_rounds: null,
  ...fields,
});

const series = (id: string, sessionId: string, position: number, fields: Row = {}): Row => ({
  ...common(id),
  session_id: sessionId,
  position,
  is_sighter: 0,
  is_final: 0,
  is_total_override: 0,
  total_override_shot_count: null,
  ...fields,
});

const shot = (id: string, seriesId: string, position: number, valueTenths: number, inner = 0) => ({
  ...common(id),
  series_id: seriesId,
  position,
  value_tenths: valueTenths,
  is_inner_ten: inner,
});

function tables(): PulledTables {
  const empty = () => new Map<string, Row>();
  return {
    sessions: byId(
      session('s1', {
        type: 'competition',
        competition_level: 'krets',
        is_championship: 1,
        competition_name: 'Cup',
        weapon_group: 'spsf:C',
        shooter_class: '1',
        event_id: 'issf:e',
        firearm_id: 'f1',
        ammo_lot_id: 'a1',
        location: 'Range A',
        notes: 'windy',
      }),
      session('sF', { discipline_id: 'spsf-falt' }),
      session('sR', { kind: 'rounds', extra_rounds: 20 }),
      session('sH', { discipline_id: 'spsf-helmatch', program_id: 'spsf-helmatch' }),
      session('sD', { discipline_id: 'generic-rings', decimal_scoring: 1 }),
      session('sX', { discipline_id: 'not-in-this-build' }),
    ),
    series: byId(
      series('r2', 's1', 2, { is_sighter: 1 }),
      series('r1', 's1', 1),
      series('rF', 's1', 3, { is_final: 1 }),
      series('rT', 's1', 4, { is_total_override: 1, total_override_shot_count: 10 }),
      series('h1', 'sH', 1, { is_sighter: 1 }),
      series('d1', 'sD', 1),
      series('x1', 'sX', 1),
    ),
    shots: byId(
      shot('a', 'r1', 2, 90),
      shot('b', 'r1', 1, 100, 1),
      shot('c', 'r2', 1, 80),
      shot('z', 'rF', 1, 100),
      shot('d', 'd1', 1, 104),
    ),
    falt_stations: empty(),
    tags: empty(),
    firearms: byId({ ...common('f1'), make: 'Pardini', model: 'SP' }),
    firearm_groups: empty(),
    licenses: empty(),
    ammo_lots: byId({ ...common('a1'), label: 'Lot 1' }),
    session_tags: empty(),
    settings: empty(),
  };
}

const opened = (id: string) => openForm(editContext(tables()), id)!;

describe('the edit form', () => {
  it('pulls the tables the builders read, and maps them onto the edit context', () => {
    expect(EDIT_TABLES).toEqual([
      'sessions',
      'series',
      'shots',
      'falt_stations',
      'firearms',
      'ammo_lots',
    ]);
    const t = tables();
    expect(editContext(t)).toEqual({
      sessions: t.sessions,
      series: t.series,
      shots: t.shots,
      faltStations: t.falt_stations,
      firearms: t.firearms,
      ammoLots: t.ammo_lots,
    });
  });

  it('U1 the form opens from the pulled rows: fields, one text per main-section series', () => {
    const form = opened('s1');
    expect(form.initial).toEqual({
      date: '2026-05-01',
      time: '10:30',
      name: 'Session s1',
      location: 'Range A',
      notes: 'windy',
      competitionName: 'Cup',
      competitionLevel: 'krets',
      isChampionship: true,
      weaponGroup: 'spsf:C',
      shooterClass: '1',
      eventId: 'issf:e',
      firearmId: 'f1',
      ammoLotId: 'a1',
      rows: [
        {
          key: expect.any(Number),
          id: 'r1',
          text: 'X 9',
          isSighter: false,
          deleted: false,
          hasPhoto: false,
        },
        {
          key: expect.any(Number),
          id: 'r2',
          text: '8',
          isSighter: true,
          deleted: false,
          hasPhoto: false,
        },
      ],
    });
    expect(new Set(form.initial.rows.map((r) => r.key)).size).toBe(2);
    expect(form.opened.session.id).toBe('s1');
    expect(form).toMatchObject({
      editsSeries: true,
      fixed: false,
      mode: 'integer',
      seriesLength: 5,
      phoneOnly: null,
    });
  });

  it('U1 final and total-only series are listed read-only, by position', () => {
    expect(opened('s1').readOnly).toEqual([
      { id: 'rF', position: 3, kind: 'final', text: '10', hasPhoto: false },
      { id: 'rT', position: 4, kind: 'totalOnly', text: '', hasPhoto: false },
    ]);
  });

  it('a series with a photo, uploaded or still on the phone, is marked; a shot-less one too', () => {
    const t = tables();
    t.series.set('r1', series('r1', 's1', 1, { photo_uri: 'shotledger-photo:p1' }));
    t.series.set('r5', series('r5', 's1', 5, { photo_uri: 'file:///local/target.jpg' }));
    t.series.set('rF', series('rF', 's1', 3, { is_final: 1, photo_uri: 'shotledger-photo:p2' }));
    const form = openForm(editContext(t), 's1')!;
    expect(form.initial.rows.map((r) => [r.id, r.text, r.hasPhoto])).toEqual([
      ['r1', 'X 9', true],
      ['r2', '8', false],
      ['r5', '', true],
    ]);
    expect(form.readOnly.map((r) => [r.id, r.hasPhoto])).toEqual([
      ['rF', true],
      ['rT', false],
    ]);
    // Display only: the draft Save builds carries no photo.
    expect(toDraft('s1', form.initial, form.initial).series[2]).toEqual({
      id: 'r5',
      text: '',
      isSighter: false,
      deleted: false,
    });
  });

  it('a fält session shows its live station count, a rounds-only one its rounds, for the phone', () => {
    const t = tables();
    const station = (id: string, position: number, fields: Row = {}) => ({
      ...common(id),
      session_id: 'sF',
      position,
      ...fields,
    });
    t.falt_stations.set('st1', station('st1', 1));
    t.falt_stations.set('st2', station('st2', 2));
    t.falt_stations.set('st3', station('st3', 3, { deleted_at: OLD }));
    expect(openForm(editContext(t), 'sF')!.phoneOnly).toEqual({ kind: 'stations', count: 2 });
    expect(opened('sF').phoneOnly).toEqual({ kind: 'stations', count: 0 });
    expect(opened('sR').phoneOnly).toEqual({ kind: 'rounds', rounds: 20 });
    t.sessions.set('sR0', session('sR0', { kind: 'rounds' }));
    t.sessions.set(
      'sRF',
      session('sRF', { kind: 'rounds', discipline_id: 'spsf-falt', extra_rounds: 6 }),
    );
    expect(openForm(editContext(t), 'sR0')!.phoneOnly).toEqual({ kind: 'rounds', rounds: 0 });
    expect(openForm(editContext(t), 'sRF')!.phoneOnly).toEqual({ kind: 'rounds', rounds: 6 });
    expect(opened('sX').phoneOnly).toBeNull();
  });

  it('U1 blank columns open as empty text or null', () => {
    expect(opened('sR').initial).toMatchObject({
      name: 'Session sR',
      location: '',
      notes: '',
      competitionName: '',
      competitionLevel: null,
      isChampionship: false,
      weaponGroup: null,
      firearmId: null,
      ammoLotId: null,
      rows: [],
    });
  });

  it('U1 fält, rounds-only and unknown-discipline sessions edit their fields only (E11)', () => {
    expect(opened('sF')).toMatchObject({ editsSeries: false, readOnly: [] });
    expect(opened('sR')).toMatchObject({ editsSeries: false });
    const unknown = opened('sX');
    expect(unknown).toMatchObject({ editsSeries: false, mode: 'integer', seriesLength: 0 });
    expect(unknown.initial.rows).toEqual([]);
  });

  it('U1 a fixed format, a decimal session and a session series length', () => {
    expect(opened('sH')).toMatchObject({ fixed: true, seriesLength: 5 });
    const decimal = opened('sD');
    expect(decimal).toMatchObject({ mode: 'decimal', seriesLength: 5 });
    expect(decimal.initial.rows[0]!.text).toBe('10.4');
    const t = tables();
    t.sessions.set('sL', session('sL', { series_length: 3 }));
    expect(openForm(editContext(t), 'sL')!.seriesLength).toBe(3);
  });

  it('U1 a match format with no skeleton is free format; whole rings without decimal scoring', () => {
    const t = tables();
    t.sessions.set('sP', session('sP', { program_id: 'spsf-precision' }));
    expect(openForm(editContext(t), 'sP')).toMatchObject({ fixed: false, mode: 'integer' });
    t.sessions.set('sG', session('sG', { discipline_id: 'generic-rings' }));
    expect(openForm(editContext(t), 'sG')).toMatchObject({ fixed: false, mode: 'integer' });
  });

  it('U1 a column missing from the payload opens as null', () => {
    const t = tables();
    const row = session('sM');
    delete row.competition_level;
    delete row.firearm_id;
    t.sessions.set('sM', row);
    expect(openForm(editContext(t), 'sM')!.initial).toMatchObject({
      competitionLevel: null,
      firearmId: null,
    });
  });

  it('U1 a session that is not live opens nothing', () => {
    const t = tables();
    t.sessions.set('sDel', session('sDel', { deleted_at: OLD }));
    expect(openForm(editContext(t), 'sDel')).toBeNull();
    expect(openForm(editContext(t), 'nope')).toBeNull();
  });

  it('localDateTime reads a UTC instant in local time; an unreadable one is blank', () => {
    expect(localDateTime('2026-01-15T23:30:00.000Z')).toEqual({
      date: '2026-01-16',
      time: '00:30',
    });
    expect(localDateTime('2026-12-31T09:05:00.000Z')).toEqual({
      date: '2026-12-31',
      time: '10:05',
    });
    expect(localDateTime('garbage')).toEqual({ date: '', time: '' });
  });

  it('toDraft sends only the fields that changed, and every row as the form holds it', () => {
    const { initial } = opened('s1');
    expect(toDraft('s1', initial, initial)).toEqual({
      sessionId: 's1',
      fields: {},
      series: [
        { id: 'r1', text: 'X 9', isSighter: false, deleted: false },
        { id: 'r2', text: '8', isSighter: true, deleted: false },
      ],
    });
    const changed: EditForm = {
      ...initial,
      name: 'New',
      location: '',
      notes: 'n',
      competitionName: 'C2',
      competitionLevel: 'riks',
      isChampionship: false,
      weaponGroup: null,
      shooterClass: '2',
      eventId: null,
      firearmId: null,
      ammoLotId: null,
    };
    expect(toDraft('s1', initial, changed).fields).toEqual({
      name: 'New',
      location: '',
      notes: 'n',
      competitionName: 'C2',
      competitionLevel: 'riks',
      isChampionship: false,
      weaponGroup: null,
      shooterClass: '2',
      eventId: null,
      firearmId: null,
      ammoLotId: null,
    });
  });

  it('toDraft sends the date and time as one UTC instant when either changed; blank when incomplete', () => {
    const { initial } = opened('s1');
    expect(toDraft('s1', initial, { ...initial, time: '11:00' }).fields).toEqual({
      startedAt: '2026-05-01T09:00:00.000Z',
    });
    expect(toDraft('s1', initial, { ...initial, date: '2026-05-02' }).fields).toEqual({
      startedAt: '2026-05-02T08:30:00.000Z',
    });
    expect(toDraft('s1', initial, { ...initial, date: '' }).fields).toEqual({ startedAt: '' });
  });

  it('addRow adds a blank new series; setRow changes one row by key', () => {
    const { initial } = opened('s1');
    const added = addRow(initial);
    expect(added.rows).toHaveLength(3);
    expect(added.rows[2]).toEqual({
      key: expect.any(Number),
      id: null,
      text: '',
      isSighter: false,
      deleted: false,
      hasPhoto: false,
    });
    expect(added.rows[2]!.key).not.toBe(initial.rows[1]!.key);
    const key = initial.rows[0]!.key;
    const edited = setRow(initial, key, { text: '9', deleted: true });
    expect(edited.rows[0]).toMatchObject({ id: 'r1', text: '9', deleted: true });
    expect(edited.rows[1]).toBe(initial.rows[1]);
    expect(initial.rows[0]!.text).toBe('X 9');
  });

  it('canMarkSighter: one sighter in free format, a deleted row holds none, never in a fixed format', () => {
    const { initial } = opened('s1');
    const [r1, r2] = initial.rows;
    expect(canMarkSighter(initial, r1!.key, false)).toBe(false);
    expect(canMarkSighter(initial, r2!.key, false)).toBe(true);
    const deleted = setRow(initial, r2!.key, { deleted: true });
    expect(canMarkSighter(deleted, r1!.key, false)).toBe(true);
    expect(canMarkSighter(initial, r2!.key, true)).toBe(false);
  });
});
