import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ClientChangeSchema, PUSH_BATCH_MAX, type ClientChange } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { applyRank } from './order';
import type { Payload } from './rows';
import {
  buildSessionDelete,
  buildSessionEdit,
  openedSession,
  type EditContext,
  type EditResult,
  type OpenedSession,
  type SeriesEditDraft,
  type SessionEditDraft,
  type StationEditDraft,
} from './session-edit';

const NOW = '2026-10-12T10:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';

function makeDeps() {
  let ids = 0;
  let changeIds = 0;
  const hex = (n: number) => n.toString(16).padStart(12, '0');
  return {
    newId: () => `0199c000-0000-7000-8000-${hex((ids += 1))}`,
    newChangeId: () => `00000000-0000-4000-8000-${hex((changeIds += 1))}`,
    now: () => NOW,
  };
}

const common = (id: string, deletedAt: string | null = null) => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: deletedAt,
});

const session = (id: string, fields: Payload = {}): Payload => ({
  ...common(id),
  name: `Session ${id}`,
  type: 'training',
  kind: 'series',
  series_entry_mode: 'ask',
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
  started_at: '2026-05-01T10:00:00.000Z',
  location: 'Range A',
  notes: null,
  decimal_scoring: 0,
  series_length: null,
  extra_rounds: null,
  external_source: null,
  external_ref: null,
  official_placement: null,
  official_standardmedalj: null,
  // A column this build does not know must survive a rewrite.
  future_column: 'kept',
  ...fields,
});

const series = (id: string, sessionId: string, position: number, fields: Payload = {}) => ({
  ...common(id),
  session_id: sessionId,
  position,
  is_sighter: 0,
  is_final: 0,
  photo_uri: null,
  photo_geometry: null,
  is_total_override: 0,
  total_override_tenths: null,
  total_override_shot_count: null,
  note: null,
  ...fields,
});

const shot = (
  id: string,
  seriesId: string,
  position: number,
  valueTenths: number,
  isInnerTen = false,
  deletedAt: string | null = null,
) => ({
  ...common(id, deletedAt),
  series_id: seriesId,
  position,
  value_tenths: valueTenths,
  is_inner_ten: isInnerTen ? 1 : 0,
  is_inner_ten_decimal: 0,
});

const firearm = (
  id: string,
  roundCount: number,
  since: number,
  deletedAt: string | null = null,
) => ({
  ...common(id, deletedAt),
  make: 'Make',
  model: id,
  round_count: roundCount,
  rounds_since_maintenance: since,
  future_column: 'kept',
});

const station = (id: string, sessionId: string, deletedAt: string | null = null) => ({
  ...common(id, deletedAt),
  session_id: sessionId,
  position: 1,
});

const byId = (...rows: Payload[]) => new Map(rows.map((row) => [row.id as string, row]));

/**
 * s1: a competition on f1, free format, 2 extra rounds. r1 (5 shots: 10 9 9
 *     8 X), r2 a 2-shot sighter, rF a final (3 shots), rT total-only with a
 *     stored count of 10, rGone deleted; a deleted shot in r1. 22 rounds.
 * s2: fält on f2, three live stations and a deleted one. 18 rounds.
 * s3: rounds only on f2, 30 rounds.
 * sH: Nationell helmatch (a fixed format with sighters) on no firearm.
 * sDec: generic rings with decimal scoring.
 * sDel: deleted on the phone.
 */
function logbook(): EditContext {
  return {
    sessions: byId(
      session('s1', {
        type: 'competition',
        firearm_id: 'f1',
        ammo_lot_id: 'a1',
        extra_rounds: 2,
        competition_level: 'forening',
        is_championship: 1,
        competition_name: 'Club Cup',
        weapon_group: 'spsf:C',
        shooter_class: '1',
        event_id: null,
        notes: 'windy',
      }),
      session('s2', { discipline_id: 'spsf-falt', firearm_id: 'f2' }),
      session('s3', { kind: 'rounds', firearm_id: 'f2', extra_rounds: 30 }),
      session('sH', { discipline_id: 'spsf-helmatch', program_id: 'spsf-helmatch' }),
      session('sDec', { discipline_id: 'generic-rings', decimal_scoring: 1, firearm_id: 'f1' }),
      session('sDel', { deleted_at: OLD, firearm_id: 'f1' }),
    ),
    series: byId(
      series('r1', 's1', 1, { photo_uri: 'photo-1', photo_geometry: '{"k":1}' }),
      series('r2', 's1', 2, { is_sighter: 1 }),
      series('rF', 's1', 3, { is_final: 1 }),
      series('rT', 's1', 4, {
        is_total_override: 1,
        total_override_tenths: 900,
        total_override_shot_count: 10,
      }),
      series('rGone', 's1', 5, { deleted_at: OLD }),
      series('h1', 'sH', 1, { is_sighter: 1 }),
      series('h2', 'sH', 2),
      series('h6', 'sH', 6, { is_sighter: 1 }),
      series('d1', 'sDec', 1),
    ),
    shots: byId(
      shot('x1', 'r1', 1, 100),
      shot('x2', 'r1', 2, 90),
      shot('x3', 'r1', 3, 90),
      shot('x4', 'r1', 4, 80),
      shot('x5', 'r1', 5, 100, true),
      shot('xDead', 'r1', 6, 70, false, OLD),
      shot('y1', 'r2', 1, 80),
      shot('y2', 'r2', 2, 70),
      shot('z1', 'rF', 1, 100),
      shot('z2', 'rF', 2, 100),
      shot('z3', 'rF', 3, 90),
      shot('g1', 'rGone', 1, 50),
      shot('k1', 'h2', 1, 90),
      shot('d1a', 'd1', 1, 104),
    ),
    faltStations: byId(
      station('st1', 's2'),
      station('st2', 's2'),
      station('st3', 's2'),
      station('stDead', 's2', OLD),
    ),
    firearms: byId(
      firearm('f1', 100, 20),
      firearm('f2', 10, 10),
      firearm('f3', 5, 0),
      firearm('fx', 9, 9, OLD),
    ),
    ammoLots: byId({ ...common('a1'), label: 'Lot 1' }, { ...common('aX', OLD), label: 'Gone' }),
  };
}

const open = (id: string, context = logbook()): OpenedSession => openedSession(id, context)!;

/** The draft row the form shows for an opened series, unchanged. */
const asDrafted = (id: string, text: string, isSighter = false): SeriesEditDraft => ({
  id,
  text,
  isSighter,
  deleted: false,
});

const draft = (
  sessionId: string,
  fields: SessionEditDraft['fields'] = {},
  rows: SeriesEditDraft[] = [],
): SessionEditDraft => ({ sessionId, fields, series: rows });

function edit(d: SessionEditDraft, context = logbook(), opened = open(d.sessionId, context)) {
  return buildSessionEdit(d, opened, context, makeDeps());
}

/** A change as the builder makes it: an object payload, or null for a tombstone. */
type Change = Omit<ClientChange, 'payload'> & { payload: Payload | null };

function changesOf(result: EditResult): Change[] {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes as Change[];
}

const find = (changes: Change[], table: string, rowId: string) =>
  changes.find((c) => c.tableName === table && c.rowId === rowId);

const R1 = '10 9 9 8 X';
const R2 = '8 7';

describe('openedSession', () => {
  it('holds the live session, its live series and their live shots by position', () => {
    const opened = open('s1');
    expect(opened.session.id).toBe('s1');
    expect([...opened.series.keys()]).toEqual(['r1', 'r2', 'rF', 'rT']);
    expect(opened.series.get('r1')!.shots.map((s) => s.id)).toEqual(['x1', 'x2', 'x3', 'x4', 'x5']);
    expect(opened.series.get('rT')!.shots).toEqual([]);
    expect(opened.stations).toEqual([]);
  });

  it('R10 holds the live fält stations of the session', () => {
    expect(open('s2').stations.map((s) => s.id)).toEqual(['st1', 'st2', 'st3']);
  });

  it('is null for a session that is not live', () => {
    expect(openedSession('sDel', logbook())).toBeNull();
    expect(openedSession('nope', logbook())).toBeNull();
  });

  it('orders shots by position whatever order they were pulled in', () => {
    const context = logbook();
    const shots = context.shots as Map<string, Payload>;
    const x1 = shots.get('x1')!;
    shots.delete('x1');
    shots.set('x1', x1);
    expect(
      open('s1', context)
        .series.get('r1')!
        .shots.map((s) => s.id),
    ).toEqual(['x1', 'x2', 'x3', 'x4', 'x5']);
  });
});

describe('edit builder', () => {
  it('K1 a changed field writes the fresh session payload with that column and updated_at changed; unknown keys survive', () => {
    const context = logbook();
    const opened = open('s1', context);
    const changes = changesOf(edit(draft('s1', { location: 'Range B' }), context, opened));
    expect(changes).toHaveLength(1);
    const row = changes[0]!;
    expect(row.tableName).toBe('sessions');
    expect(row.payload).toEqual({
      ...context.sessions.get('s1'),
      location: 'Range B',
      updated_at: NOW,
    });
    expect(row.payload).not.toBe(context.sessions.get('s1'));
    expect(row.payload!.future_column).toBe('kept');
    expect(row.payload!.created_at).toBe(OLD);
  });

  it('K14 a column only the fresh pull has makes the session row stale', () => {
    const context = logbook();
    const opened = open('s1', context);
    const fresh = { ...context.sessions.get('s1')!, newer_key: 1 };
    (context.sessions as Map<string, Payload>).set('s1', fresh);
    expect(edit(draft('s1', { location: 'X' }), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'stale' }],
    });
  });

  it('K1 every session field maps to its column', () => {
    const fields = {
      name: 'Renamed',
      startedAt: '2026-05-02T08:30:00.000Z',
      location: 'Range B',
      notes: 'calm',
      competitionName: 'Spring Cup',
      competitionLevel: 'krets',
      isChampionship: false,
      weaponGroup: 'spsf:B',
      shooterClass: '2',
      eventId: 'issf:x',
      ammoLotId: null,
    };
    const payload = changesOf(edit(draft('s1', fields)))[0]!.payload!;
    expect(payload).toMatchObject({
      name: 'Renamed',
      started_at: '2026-05-02T08:30:00.000Z',
      location: 'Range B',
      notes: 'calm',
      competition_name: 'Spring Cup',
      competition_level: 'krets',
      is_championship: 0,
      weapon_group: 'spsf:B',
      shooter_class: '2',
      event_id: 'issf:x',
      ammo_lot_id: null,
    });
    // A championship already and a1 is the current lot: nothing changes.
    expect(edit(draft('s1', { isChampionship: true, ammoLotId: 'a1' }))).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
  });

  it('K1 a session of a discipline this build does not know can still have its fields edited', () => {
    const context = logbook();
    (context.sessions as Map<string, Payload>).set(
      'sNew',
      session('sNew', { discipline_id: 'new-x' }),
    );
    expect(changesOf(edit(draft('sNew', { location: 'Range B' }), context))).toHaveLength(1);
    expect(() =>
      edit(draft('sNew', {}, [{ id: null, text: '9', isSighter: false, deleted: false }]), context),
    ).toThrow(/Unknown discipline/);
  });

  it('K1 a field equal to the pulled value writes nothing; undefined and null read alike', () => {
    expect(edit(draft('s1', { location: 'Range A', notes: ' windy ' }))).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    const context = logbook();
    const s3 = { ...context.sessions.get('s3')! };
    delete s3.notes;
    (context.sessions as Map<string, Payload>).set('s3', s3);
    expect(edit(draft('s3', { notes: '' }), context)).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
  });

  it('K2 name blank → current name; location and notes trimmed, blank → null', () => {
    expect(edit(draft('s1', { name: '   ' }))).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    const payload = changesOf(
      edit(draft('s1', { name: '  New  ', location: '  ', notes: '  note  ' })),
    )[0]!.payload!;
    expect(payload).toMatchObject({ name: 'New', location: null, notes: 'note' });
    const cleared = changesOf(edit(draft('s1', { notes: '' })))[0]!.payload!;
    expect(cleared.notes).toBeNull();
    const competition = changesOf(edit(draft('s1', { competitionName: '  ' })))[0]!.payload!;
    expect(competition.competition_name).toBeNull();
  });

  it('K2 over TEXT_LIMITS → tooLong(field), nothing built; exactly at the limit is accepted', () => {
    const limits = TEXT_LIMITS.sessions;
    const over = (n: number) => 'a'.repeat(n + 1);
    expect(
      edit(
        draft('s1', {
          name: over(limits.name),
          location: over(limits.location),
          notes: over(limits.notes),
          competitionName: over(limits.competition_name),
        }),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { kind: 'tooLong', field: 'name', max: limits.name },
        { kind: 'tooLong', field: 'location', max: limits.location },
        { kind: 'tooLong', field: 'notes', max: limits.notes },
        { kind: 'tooLong', field: 'competitionName', max: limits.competition_name },
      ],
    });
    const at = changesOf(
      edit(draft('s1', { name: ` ${'a'.repeat(limits.name)} `, notes: 'b'.repeat(limits.notes) })),
    );
    expect(at[0]!.payload!.name).toHaveLength(limits.name);
  });

  it('K3 started_at under the R28 guard: each refused value → invalidStartedAt, nothing built', () => {
    for (const startedAt of [
      '',
      'not a date',
      '2026-05-02',
      '2026-05-02T08:30:00Z',
      '2026-05-02T08:30:00.000+02:00',
      '2026-02-30T08:30:00.000Z',
      '+012026-05-02T08:30:00.000Z',
    ]) {
      expect(edit(draft('s1', { startedAt }))).toEqual({
        ok: false,
        errors: [{ kind: 'invalidStartedAt' }],
      });
    }
    expect(changesOf(edit(draft('s1', { startedAt: '2026-05-02T06:30:00.000Z' })))).toHaveLength(1);
  });

  it('K25 an edited start before 1900 or more than a day ahead → startedAtOutOfRange, nothing built', () => {
    // NOW is 2026-10-12T10:00:00.000Z.
    for (const startedAt of ['1899-12-31T23:59:59.999Z', '2026-10-13T10:00:00.001Z']) {
      expect(edit(draft('s1', { startedAt }))).toEqual({
        ok: false,
        errors: [{ kind: 'startedAtOutOfRange' }],
      });
    }
    for (const startedAt of ['1900-01-01T00:00:00.000Z', '2026-10-13T10:00:00.000Z']) {
      expect(
        find(changesOf(edit(draft('s1', { startedAt }))), 'sessions', 's1')!.payload,
      ).toMatchObject({ started_at: startedAt });
    }
  });

  it('K25 a stored out-of-range start the draft does not change is not checked', () => {
    const context = logbook();
    const sessions = context.sessions as Map<string, Payload>;
    sessions.set('s1', { ...sessions.get('s1')!, started_at: '1850-01-01T00:00:00.000Z' });
    expect(changesOf(edit(draft('s1', { location: 'Range B' }), context))).toHaveLength(1);
  });

  it('K4 immutable and out-of-layer columns are never changed, whatever the draft holds', () => {
    const smuggled = {
      location: 'Range B',
      type: 'training',
      kind: 'rounds',
      disciplineId: 'issf-air-pistol',
      discipline_id: 'issf-air-pistol',
      programId: 'spsf-precision',
      program_id: 'spsf-precision',
      decimalScoring: true,
      decimal_scoring: 1,
      seriesLength: 10,
      series_length: 10,
      seriesEntryMode: 'photo',
      series_entry_mode: 'photo',
      extraRounds: 99,
      extra_rounds: 99,
      external_source: 'webshooter',
      external_ref: 'x',
      official_placement: 1,
      official_standardmedalj: 'guld',
      created_at: NOW,
      id: 'other',
    } as unknown as SessionEditDraft['fields'];
    const context = logbook();
    const payload = changesOf(edit(draft('s1', smuggled), context))[0]!.payload!;
    expect(payload).toEqual({
      ...context.sessions.get('s1'),
      location: 'Range B',
      updated_at: NOW,
    });
  });

  it('K4 a training session never takes competition fields', () => {
    expect(
      edit(
        draft('s3', {
          competitionName: 'Cup',
          competitionLevel: 'krets',
          isChampionship: true,
          weaponGroup: 'spsf:B',
          shooterClass: '2',
          eventId: 'issf:x',
        }),
      ),
    ).toEqual({ ok: false, errors: [{ kind: 'nothingToChange' }] });
  });

  it('K5 a re-entered series: a tombstone per live shot, new rows at 1..k with fresh ids', () => {
    const changes = changesOf(edit(draft('s1', {}, [asDrafted('r1', '10 10 X')])));
    const shots = changes.filter((c) => c.tableName === 'shots');
    expect(shots.filter((c) => c.payload === null).map((c) => c.rowId)).toEqual([
      'x1',
      'x2',
      'x3',
      'x4',
      'x5',
    ]);
    for (const c of shots.filter((c) => c.payload === null)) expect(c.deletedAt).toBe(NOW);
    const added = shots.filter((c) => c.payload !== null);
    expect(added.map((c) => c.payload)).toEqual([
      expect.objectContaining({ series_id: 'r1', position: 1, value_tenths: 100, is_inner_ten: 0 }),
      expect.objectContaining({ series_id: 'r1', position: 2, value_tenths: 100, is_inner_ten: 0 }),
      expect.objectContaining({ series_id: 'r1', position: 3, value_tenths: 100, is_inner_ten: 1 }),
    ]);
    const ids = added.map((c) => c.rowId);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(['x1', 'x2', 'x3', 'x4', 'x5']).not.toContain(id);
    // The series row itself is not rewritten: its photo stays as it was (E10).
    expect(find(changes, 'series', 'r1')).toBeUndefined();
  });

  it('K5 an unchanged text writes nothing; the same values with another inner ten or count do', () => {
    expect(edit(draft('s1', {}, [asDrafted('r1', R1), asDrafted('r2', R2, true)]))).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    // Spacing and case are not shots.
    expect(edit(draft('s1', {}, [asDrafted('r1', ' 10  9 9 8 x ')]))).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    for (const text of ['X 9 9 8 X', '10 9 9 8 10', '10 9 9 8', '10 9 9 7 X']) {
      const changes = changesOf(edit(draft('s1', {}, [asDrafted('r1', text)])));
      expect(changes.filter((c) => c.tableName === 'shots' && c.payload === null)).toHaveLength(5);
    }
  });

  it('K5 decimal scoring parses and compares in tenths', () => {
    expect(edit(draft('sDec', {}, [asDrafted('d1', '10.4')]))).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    const changes = changesOf(edit(draft('sDec', {}, [asDrafted('d1', '10.5')])));
    expect(changes.find((c) => c.payload?.value_tenths === 105)).toBeDefined();
    // The same discipline scored in whole rings reads whole rings.
    const context = logbook();
    const sessions = context.sessions as Map<string, Payload>;
    sessions.set('sDec', { ...sessions.get('sDec')!, decimal_scoring: 0 });
    (context.shots as Map<string, Payload>).set('d1a', shot('d1a', 'd1', 1, 100));
    expect(edit(draft('sDec', {}, [asDrafted('d1', '10')]), context)).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
  });

  it('K5 a series with no live shots gets its new shots and no tombstone', () => {
    const changes = changesOf(edit(draft('sH', {}, [asDrafted('h1', '9 X')])));
    expect(changes.map((c) => [c.tableName, c.payload === null])).toEqual([
      ['shots', false],
      ['shots', false],
    ]);
  });

  it('R12 a series with a photo and no shots, left empty, writes nothing', () => {
    const context = logbook();
    const series = context.series as Map<string, Payload>;
    series.set('h1', { ...series.get('h1')!, photo_uri: 'shotledger-photo:p1' });
    expect(edit(draft('sH', {}, [asDrafted('h1', '', true)]), context)).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
  });

  it('K5 an emptied series keeps its row and loses its shots', () => {
    const changes = changesOf(edit(draft('s1', {}, [asDrafted('r1', '')])));
    expect(changes.filter((c) => c.tableName === 'shots').every((c) => c.payload === null)).toBe(
      true,
    );
    expect(find(changes, 'series', 'r1')).toBeUndefined();
  });

  it('K6 a new series: one series row (main section, next position) then its shots', () => {
    const changes = changesOf(
      edit(
        draft('s1', {}, [
          asDrafted('r1', R1),
          { id: null, text: '9 9', isSighter: false, deleted: false },
        ]),
      ),
    );
    const newSeries = changes.filter((c) => c.tableName === 'series');
    expect(newSeries).toHaveLength(1);
    const row = newSeries[0]!.payload!;
    expect(row).toMatchObject({
      session_id: 's1',
      position: 5,
      is_sighter: 0,
      is_final: 0,
      is_total_override: 0,
      photo_uri: null,
      deleted_at: null,
      created_at: NOW,
    });
    expect(newSeries[0]!.rowId).toBe(row.id);
    const shots = changes.filter((c) => c.tableName === 'shots');
    expect(shots.map((c) => [c.payload!.series_id, c.payload!.position])).toEqual([
      [row.id, 1],
      [row.id, 2],
    ]);
  });

  it('K6 two new series take successive positions; a deleted series still holds its position number', () => {
    const changes = changesOf(
      edit(
        draft('s1', {}, [
          { id: null, text: '9', isSighter: false, deleted: false },
          { id: null, text: '8', isSighter: false, deleted: false },
        ]),
      ),
    );
    expect(changes.filter((c) => c.tableName === 'series').map((c) => c.payload!.position)).toEqual(
      [5, 6],
    );
    // A session with no series starts at 1.
    const first = changesOf(
      edit(draft('s3', {}, [{ id: null, text: '9', isSighter: false, deleted: false }])),
    );
    expect(first.find((c) => c.tableName === 'series')!.payload!.position).toBe(1);
  });

  it('K6 a blank new series, or one added and deleted again, writes nothing', () => {
    expect(
      edit(
        draft('s1', {}, [
          { id: null, text: '  ', isSighter: true, deleted: false },
          { id: null, text: '9 9', isSighter: false, deleted: true },
        ]),
      ),
    ).toEqual({ ok: false, errors: [{ kind: 'nothingToChange' }] });
  });

  it('K6 a new row deleted again is not read, whatever its text', () => {
    expect(
      edit(
        draft('s1', {}, [
          { id: null, text: 'abc', isSighter: false, deleted: true },
          { id: null, text: '1 2 3 4 5 6 7', isSighter: false, deleted: true },
        ]),
      ),
    ).toEqual({ ok: false, errors: [{ kind: 'nothingToChange' }] });
  });

  it('K6 more shots than the series length, or an unparsable token, is refused per row', () => {
    expect(
      edit(
        draft('s1', {}, [
          asDrafted('r1', '10 10 10 10 10 10'),
          { id: null, text: '9 q', isSighter: false, deleted: false },
          { id: null, text: '1 2 3 4 5 6', isSighter: false, deleted: false },
        ]),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { kind: 'tooManyShots', row: 1, max: 5 },
        { kind: 'seriesText', row: 2, error: { kind: 'token', token: 'q', position: 2 } },
        { kind: 'tooManyShots', row: 3, max: 5 },
      ],
    });
  });

  it('K6 an opened series re-entered with an unparsable token is refused on its row', () => {
    expect(edit(draft('s1', {}, [asDrafted('r2', R2, true), asDrafted('r1', '9 9,5')]))).toEqual({
      ok: false,
      errors: [{ kind: 'seriesText', row: 2, error: { kind: 'comma', token: '9,5', position: 2 } }],
    });
  });

  it('K6 the series length is the program, else the session, else the discipline', () => {
    const context = logbook();
    const sessions = context.sessions as Map<string, Payload>;
    sessions.set('s3', { ...sessions.get('s3')!, series_length: 3 });
    const row = (text: string) => ({ id: null, text, isSighter: false, deleted: false });
    expect(edit(draft('s3', {}, [row('1 2 3 4')]), context)).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyShots', row: 1, max: 3 }],
    });
    // Helmatch's program: 5 a series; generic rings' default is also 5.
    expect(edit(draft('sH', {}, [row('1 2 3 4 5 6')]))).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyShots', row: 1, max: 5 }],
    });
    sessions.set('sH', { ...sessions.get('sH')!, series_length: 2 });
    expect(edit(draft('sH', {}, [row('1 2 3')]), context).ok).toBe(true);
  });

  it('K7 sighter: set or cleared on the series row, the rest of it spread', () => {
    const context = logbook();
    const cleared = changesOf(edit(draft('s1', {}, [asDrafted('r2', R2, false)]), context));
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.payload).toEqual({
      ...context.series.get('r2'),
      is_sighter: 0,
      updated_at: NOW,
    });
    const set = changesOf(
      edit(draft('s1', {}, [asDrafted('r1', R1, true), asDrafted('r2', R2, false)]), context),
    );
    expect(find(set, 'series', 'r1')!.payload).toEqual({
      ...context.series.get('r1'),
      is_sighter: 1,
      updated_at: NOW,
    });
    // Its photo columns came along unchanged (E10).
    expect(find(set, 'series', 'r1')!.payload).toMatchObject({
      photo_uri: 'photo-1',
      photo_geometry: '{"k":1}',
    });
  });

  it('K7 a second sighter in a free-format section → secondSighter on the rows that mark one', () => {
    expect(edit(draft('s1', {}, [asDrafted('r1', R1, true)]))).toEqual({
      ok: false,
      errors: [{ kind: 'secondSighter', row: 1 }],
    });
    expect(
      edit(draft('s1', {}, [{ id: null, text: '9', isSighter: true, deleted: false }])),
    ).toEqual({ ok: false, errors: [{ kind: 'secondSighter', row: 1 }] });
    // r2 is not on the form, yet it is still the section's sighter.
    expect(
      edit(
        draft('s1', {}, [
          asDrafted('r1', R1, true),
          { id: null, text: '9', isSighter: true, deleted: false },
        ]),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { kind: 'secondSighter', row: 1 },
        { kind: 'secondSighter', row: 2 },
      ],
    });
  });

  it('K7 the sighter moves when the old one is cleared or deleted; a final sighter is another section', () => {
    const context = logbook();
    const series = context.series as Map<string, Payload>;
    series.set('rF', { ...series.get('rF')!, is_sighter: 1 });
    const moved = changesOf(
      edit(draft('s1', {}, [asDrafted('r1', R1, true), asDrafted('r2', R2, false)]), context),
    );
    expect(moved.filter((c) => c.tableName === 'series')).toHaveLength(2);
    const replaced = changesOf(
      edit(
        draft('s1', {}, [
          { ...asDrafted('r2', R2, true), deleted: true },
          { id: null, text: '9', isSighter: true, deleted: false },
        ]),
        context,
      ),
    );
    expect(
      replaced.find((c) => c.tableName === 'series' && c.payload !== null)!.payload,
    ).toMatchObject({
      is_sighter: 1,
    });
  });

  it('K7 a match format with no skeleton is free format: the sighter can move', () => {
    const context = logbook();
    const sessions = context.sessions as Map<string, Payload>;
    sessions.set('s1', { ...sessions.get('s1')!, program_id: 'spsf-precision' });
    const changes = changesOf(
      edit(draft('s1', {}, [asDrafted('r1', R1, true), asDrafted('r2', R2, false)]), context),
    );
    expect(changes.map((c) => [c.rowId, c.payload!.is_sighter])).toEqual([
      ['r1', 1],
      ['r2', 0],
    ]);
  });

  it('K7 a sighter set on another device since the form opened still counts', () => {
    const context = logbook();
    const series = context.series as Map<string, Payload>;
    series.set('r2', { ...series.get('r2')!, is_sighter: 0 });
    const opened = open('s1', context);
    // The phone marks r2 (which the web leaves alone) while the form is open.
    series.set('r2', { ...series.get('r2')!, is_sighter: 1, updated_at: NOW });
    expect(edit(draft('s1', {}, [asDrafted('r1', R1, true)]), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'secondSighter', row: 1 }],
    });
    // Or adds a sighter series meanwhile.
    series.set('r2', { ...series.get('r2')!, is_sighter: 0 });
    const reopened = open('s1', context);
    series.set('rP', { ...series.get('r2')!, id: 'rP', position: 9, is_sighter: 1 });
    expect(edit(draft('s1', {}, [asDrafted('r1', R1, true)]), context, reopened)).toEqual({
      ok: false,
      errors: [{ kind: 'secondSighter', row: 1 }],
    });
  });

  it('K7 the page sends every series: an untouched one keeps the sighter another device set', () => {
    const context = logbook();
    const series = context.series as Map<string, Payload>;
    series.set('r2', { ...series.get('r2')!, is_sighter: 0 });
    const opened = open('s1', context);
    series.set('r2', { ...series.get('r2')!, is_sighter: 1, updated_at: NOW });
    // r2 drafted as the form opened it (not a sighter), r1 marked.
    const rows = [asDrafted('r1', R1, true), asDrafted('r2', R2, false)];
    expect(edit(draft('s1', {}, rows), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'secondSighter', row: 1 }],
    });
    const added = [
      asDrafted('r1', R1),
      asDrafted('r2', R2),
      { id: null, text: '9', isSighter: true, deleted: false },
    ];
    expect(edit(draft('s1', {}, added), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'secondSighter', row: 3 }],
    });
  });

  it('K7 a fixed-format skeleton: sighter flags are not offered, so the draft cannot change them', () => {
    // h1 is the skeleton's sighter; the draft says otherwise and adds a sighter row.
    expect(
      edit(
        draft('sH', {}, [
          asDrafted('h1', '', false),
          asDrafted('h2', '9', true),
          { id: null, text: '9', isSighter: true, deleted: false },
        ]),
      ),
    ).toMatchObject({ ok: true });
    const changes = changesOf(
      edit(
        draft('sH', {}, [
          asDrafted('h1', '', false),
          asDrafted('h2', '9', true),
          { id: null, text: '9', isSighter: true, deleted: false },
        ]),
      ),
    );
    expect(
      changes.filter((c) => c.tableName === 'series').map((c) => c.payload!.is_sighter),
    ).toEqual([0]);
  });

  it('K8 a deleted series: tombstones for it and its live shots, none for other series', () => {
    const changes = changesOf(edit(draft('s1', {}, [{ ...asDrafted('r1', R1), deleted: true }])));
    expect(
      changes
        .filter((c) => c.tableName !== 'firearms')
        .map((c) => [c.tableName, c.rowId, c.payload]),
    ).toEqual([
      ['series', 'r1', null],
      ['shots', 'x1', null],
      ['shots', 'x2', null],
      ['shots', 'x3', null],
      ['shots', 'x4', null],
      ['shots', 'x5', null],
    ]);
  });

  it('K9 a final or total-only series in the draft → readOnlySeries, nothing built', () => {
    expect(
      edit(
        draft('s1', {}, [
          asDrafted('rF', '10 10 9'),
          { ...asDrafted('rT', ''), deleted: true },
          asDrafted('r1', '1'),
        ]),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { kind: 'readOnlySeries', row: 1 },
        { kind: 'readOnlySeries', row: 2 },
      ],
    });
  });

  it('K9 a series the form did not open is a programming error', () => {
    expect(() => edit(draft('s1', {}, [asDrafted('h2', '9')]))).toThrow(
      new RangeError('series h2 is not one the form opened'),
    );
    expect(() => buildSessionEdit(draft('s1'), open('s3'), logbook(), makeDeps())).toThrow(
      new RangeError('the form opened s3, not s1'),
    );
  });

  it('K11 same firearm: moves by V_after − V_before, both counters', () => {
    // r1 5 → 2 shots: 22 → 19.
    const changes = changesOf(edit(draft('s1', {}, [asDrafted('r1', '9 9')])));
    expect(changes[0]).toMatchObject({ tableName: 'firearms', rowId: 'f1' });
    expect(changes[0]!.payload).toEqual({
      ...logbook().firearms.get('f1'),
      round_count: 97,
      rounds_since_maintenance: 17,
      updated_at: NOW,
    });
    // A new 4-shot series: +4.
    const added = changesOf(
      edit(draft('s1', {}, [{ id: null, text: '1 2 3 4', isSighter: false, deleted: false }])),
    );
    expect(find(added, 'firearms', 'f1')!.payload).toMatchObject({
      round_count: 104,
      rounds_since_maintenance: 24,
    });
  });

  it('K11 A→B moves −V_before and +V_after; None moves nothing on its side', () => {
    const changes = changesOf(
      edit(draft('s1', { firearmId: 'f3' }, [{ ...asDrafted('r2', R2, true), deleted: true }])),
    );
    // 22 before, 20 after the 2-shot sighter goes.
    expect(find(changes, 'firearms', 'f1')!.payload).toMatchObject({
      round_count: 78,
      rounds_since_maintenance: 0,
    });
    expect(find(changes, 'firearms', 'f3')!.payload).toMatchObject({
      round_count: 25,
      rounds_since_maintenance: 20,
    });
    const toNone = changesOf(edit(draft('s1', { firearmId: null })));
    expect(toNone.filter((c) => c.tableName === 'firearms').map((c) => c.rowId)).toEqual(['f1']);
    const fromNone = changesOf(edit(draft('sH', { firearmId: 'f2' })));
    // Helmatch's one shot.
    expect(
      fromNone
        .filter((c) => c.tableName === 'firearms')
        .map((c) => [c.rowId, c.payload!.round_count]),
    ).toEqual([['f2', 11]]);
  });

  it('K11 a firearm not live is not written; a zero move writes no firearm', () => {
    const context = logbook();
    const sessions = context.sessions as Map<string, Payload>;
    sessions.set('s3', { ...sessions.get('s3')!, firearm_id: 'fx' });
    const changes = changesOf(edit(draft('s3', { firearmId: 'f1' }), context));
    expect(changes.filter((c) => c.tableName === 'firearms').map((c) => c.rowId)).toEqual(['f1']);
    // A same-length re-entry, or a field edit, moves nothing.
    const same = changesOf(edit(draft('s1', { notes: 'x' }, [asDrafted('r1', '1 1 1 1 1')])));
    expect(same.some((c) => c.tableName === 'firearms')).toBe(false);
    // A session with nothing to move.
    const empty = changesOf(
      edit(draft('sH', { firearmId: 'f2' }, [{ ...asDrafted('h2', '9'), deleted: true }])),
    );
    expect(empty.some((c) => c.tableName === 'firearms')).toBe(false);
  });

  it('K11 the counters are floored at 0', () => {
    const context = logbook();
    (context.firearms as Map<string, Payload>).set('f1', firearm('f1', 3, 1));
    const changes = changesOf(
      edit(draft('s1', {}, [{ ...asDrafted('r1', R1), deleted: true }]), context),
    );
    expect(find(changes, 'firearms', 'f1')!.payload).toMatchObject({
      round_count: 0,
      rounds_since_maintenance: 0,
    });
  });

  it('K12 volume counts live series (sighters), total-only by stored count, extra rounds and fält stations', () => {
    // s1: 5 + 2 sighter + 3 final + 10 total-only + 2 extra = 22 (the deleted series and shot do not count).
    expect(
      find(changesOf(edit(draft('s1', { firearmId: null }))), 'firearms', 'f1')!.payload,
    ).toMatchObject({ round_count: 78 });
    // s2: three live stations × 6.
    expect(
      find(changesOf(edit(draft('s2', { firearmId: null }))), 'firearms', 'f2')!.payload,
    ).toMatchObject({ round_count: 0, rounds_since_maintenance: 0 });
    expect(
      find(changesOf(edit(draft('s2', { firearmId: 'f3' }))), 'firearms', 'f3')!.payload,
    ).toMatchObject({ round_count: 23 });
    // s3: 30 extra rounds; a total-only series with no stored count is the discipline's 5.
    const context = logbook();
    (context.series as Map<string, Payload>).set(
      'rT0',
      series('rT0', 's3', 1, { is_total_override: 1, total_override_shot_count: null }),
    );
    expect(
      find(changesOf(edit(draft('s3', { firearmId: 'f3' }), context)), 'firearms', 'f3')!.payload,
    ).toMatchObject({ round_count: 40 });
  });

  it('K13 an unknown or deleted firearm or ammo lot → unknownFirearm / unknownAmmoLot', () => {
    for (const firearmId of ['nope', 'fx']) {
      expect(edit(draft('s1', { firearmId }))).toEqual({
        ok: false,
        errors: [{ kind: 'unknownFirearm' }],
      });
    }
    for (const ammoLotId of ['nope', 'aX']) {
      expect(edit(draft('s1', { ammoLotId }))).toEqual({
        ok: false,
        errors: [{ kind: 'unknownAmmoLot' }],
      });
    }
  });

  it('K14 stale: a changed session row → stale, nothing built', () => {
    const context = logbook();
    const opened = open('s1', context);
    const sessions = context.sessions as Map<string, Payload>;
    sessions.set('s1', { ...sessions.get('s1')!, notes: 'from the phone', updated_at: NOW });
    expect(edit(draft('s1', { location: 'X' }), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'stale' }],
    });
    // Even with only a series edit: the session row is always compared.
    expect(edit(draft('s1', {}, [asDrafted('r1', '9')]), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'stale' }],
    });
    // A column dropped by the other device counts too.
    const fewer = { ...opened.session };
    delete fewer.notes;
    sessions.set('s1', fewer);
    expect(edit(draft('s1', { location: 'X' }), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'stale' }],
    });
  });

  it('K14 stale: an edited series whose row or live shot ids changed → stale', () => {
    const cases: ((c: EditContext) => void)[] = [
      (c) => {
        const s = c.series as Map<string, Payload>;
        s.set('r1', { ...s.get('r1')!, photo_uri: 'other', updated_at: NOW });
      },
      (c) => {
        (c.shots as Map<string, Payload>).delete('x5');
      },
      (c) => {
        (c.shots as Map<string, Payload>).set('x9', shot('x9', 'r1', 6, 90));
      },
      (c) => {
        // Re-entered on the phone: same count, new ids.
        const s = c.shots as Map<string, Payload>;
        s.delete('x1');
        s.set('n1', shot('n1', 'r1', 1, 100));
      },
      (c) => {
        (c.series as Map<string, Payload>).delete('r1');
      },
      (c) => {
        const s = c.series as Map<string, Payload>;
        s.set('r1', { ...s.get('r1')!, deleted_at: NOW });
      },
    ];
    for (const change of cases) {
      for (const row of [
        asDrafted('r1', '9'),
        asDrafted('r1', R1, true),
        { ...asDrafted('r1', R1), deleted: true },
      ]) {
        const context = logbook();
        const opened = open('s1', context);
        change(context);
        const rows = row.isSighter ? [row, asDrafted('r2', R2, false)] : [row];
        expect(edit(draft('s1', {}, rows), context, opened)).toEqual({
          ok: false,
          errors: [{ kind: 'stale' }],
        });
      }
    }
  });

  it('K14 a series the user did not touch, or one added meanwhile, does not make it stale', () => {
    const context = logbook();
    const opened = open('s1', context);
    // The phone re-entered r2 and added a series after the form opened.
    const shots = context.shots as Map<string, Payload>;
    shots.delete('y1');
    shots.set('y9', shot('y9', 'r2', 1, 100));
    (context.series as Map<string, Payload>).set('rNew', series('rNew', 's1', 6));
    shots.set('w1', shot('w1', 'rNew', 1, 90));
    const changes = changesOf(
      edit(draft('s1', {}, [asDrafted('r1', '9'), asDrafted('r2', R2, true)]), context, opened),
    );
    expect(changes.some((c) => c.rowId === 'y9' || c.rowId === 'rNew' || c.rowId === 'r2')).toBe(
      false,
    );
    // The new series counts in the volume and the next position.
    expect(find(changes, 'firearms', 'f1')!.payload).toMatchObject({ round_count: 96 });
    const added = changesOf(
      edit(
        draft('s1', {}, [{ id: null, text: '9', isSighter: false, deleted: false }]),
        context,
        opened,
      ),
    );
    expect(added.find((c) => c.tableName === 'series')!.payload!.position).toBe(7);
  });

  it('K15 gone: the session absent from fresh, or deleted_at set → gone', () => {
    const opened = open('s1');
    const context = logbook();
    (context.sessions as Map<string, Payload>).delete('s1');
    expect(edit(draft('s1', { location: 'X' }), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'gone' }],
    });
    const deleted = logbook();
    const sessions = deleted.sessions as Map<string, Payload>;
    sessions.set('s1', { ...sessions.get('s1')!, deleted_at: NOW });
    expect(edit(draft('s1', { name: '' }), deleted, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'gone' }],
    });
  });

  it('K16 nothing changed → nothingToChange', () => {
    expect(edit(draft('s1'))).toEqual({ ok: false, errors: [{ kind: 'nothingToChange' }] });
  });

  it('K16 over PUSH_BATCH_MAX → tooManyChanges(max, needed); exactly 500 allowed', () => {
    const context = logbook();
    const sessions = context.sessions as Map<string, Payload>;
    sessions.set('big', session('big', { series_length: 1000 }));
    const s = context.series as Map<string, Payload>;
    const shots = context.shots as Map<string, Payload>;
    s.set('bigR', series('bigR', 'big', 1));
    // 249 live shots re-entered as 250: 249 tombstones + 250 rows = 499, + the session = 500.
    for (let i = 1; i <= 249; i += 1) shots.set(`b${i}`, shot(`b${i}`, 'bigR', i, 90));
    const text = (n: number) => Array.from({ length: n }, () => '1').join(' ');
    const ok = edit(draft('big', { notes: 'x' }, [asDrafted('bigR', text(250))]), context);
    expect(changesOf(ok)).toHaveLength(PUSH_BATCH_MAX);
    expect(edit(draft('big', { notes: 'x' }, [asDrafted('bigR', text(251))]), context)).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX, needed: PUSH_BATCH_MAX + 1 }],
    });
  });

  it('K17 every change parses, ids fresh, rowId = id, updatedAt = now, in APPLY_ORDER', () => {
    const changes = changesOf(
      edit(
        draft('s1', { firearmId: 'f3', name: 'N' }, [
          asDrafted('r1', '9 9'),
          { ...asDrafted('r2', R2, true), deleted: true },
          { id: null, text: '8', isSighter: true, deleted: false },
        ]),
      ),
    );
    const ranks = changes.map((c) => applyRank(c.tableName));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(changes.map((c) => c.clientChangeId)).size).toBe(changes.length);
    for (const change of changes) {
      expect(ClientChangeSchema.safeParse(change).success).toBe(true);
      expect(change.updatedAt).toBe(NOW);
      if (change.payload !== null) {
        expect(change.rowId).toBe(change.payload.id);
        expect(change.payload.updated_at).toBe(NOW);
        expect(change.deletedAt).toBeNull();
      } else {
        expect(change.deletedAt).toBe(NOW);
      }
    }
    expect(changes.map((c) => c.tableName)).toEqual([
      'firearms',
      'firearms',
      'sessions',
      'series',
      'series',
      'shots',
      'shots',
      'shots',
      'shots',
      'shots',
      'shots',
      'shots',
      'shots',
      'shots',
      'shots',
    ]);
  });

  it('K17 moved lists each written firearm with every other row the push carries (E8)', () => {
    const result = edit(draft('s1', { firearmId: 'f3' }, [asDrafted('r1', '9')]));
    if (!result.ok) throw new Error('expected ok');
    const others = result.changes
      .filter((c) => c.tableName !== 'firearms')
      .map(({ tableName, rowId }) => ({ tableName, rowId }));
    expect(result.moved).toEqual([
      { firearmId: 'f1', rows: others },
      { firearmId: 'f3', rows: others },
    ]);
    const notes = edit(draft('s1', { notes: 'x' }));
    expect(notes).toMatchObject({ ok: true, moved: [] });
  });
});

// --- K10: one floored move per firearm equals the phone's two saves, in
// either order (a firearm change and a series edit), for any counters.

const floor = (n: number) => Math.max(0, n);

describe('K10 one move per firearm equals the phone', () => {
  it('K10 property: A→B with an edit equals two saves in either order; same firearm floors once', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 40 }),
        fc.nat({ max: 40 }),
        fc.nat({ max: 5 }),
        fc.nat({ max: 5 }),
        (c, n, before, after) => {
          const context = logbook();
          const firearms = context.firearms as Map<string, Payload>;
          firearms.set('f1', firearm('f1', c, c));
          firearms.set('f3', firearm('f3', n, n));
          const sessions = context.sessions as Map<string, Payload>;
          sessions.set('e', session('e', { firearm_id: 'f1' }));
          (context.series as Map<string, Payload>).set('eR', series('eR', 'e', 1));
          const shots = context.shots as Map<string, Payload>;
          for (let i = 1; i <= before; i += 1) shots.set(`e${i}`, shot(`e${i}`, 'eR', i, 90));
          const text = Array.from({ length: after }, () => '9').join(' ');

          const counters = (result: EditResult, id: string, start: number) =>
            (changesOf(result).find((ch) => ch.rowId === id)?.payload?.round_count as
              number | undefined) ?? start;

          // Firearm change and series edit in one Save.
          const both = edit(draft('e', { firearmId: 'f3' }, [asDrafted('eR', text)]), context);
          // Phone, edit first then change: A ends at max(0, max(0, c + after − before) − after).
          const aEditFirst = floor(floor(c + after - before) - after);
          // Phone, change first then edit: A ends at max(0, c − before).
          const aChangeFirst = floor(c - before);
          const bEditFirst = floor(n + after);
          const bChangeFirst = floor(floor(n + before) + after - before);
          expect(counters(both, 'f1', c)).toBe(aChangeFirst);
          expect(aEditFirst).toBe(aChangeFirst);
          expect(counters(both, 'f3', n)).toBe(bEditFirst);
          expect(bChangeFirst).toBe(bEditFirst);

          // Same firearm: one net move, floored once.
          if (before !== after) {
            const same = edit(draft('e', {}, [asDrafted('eR', text)]), context);
            expect(counters(same, 'f1', c)).toBe(floor(c + after - before));
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('delete builder', () => {
  // The page opens from its last pull; Delete builds from a fresh one (R10).
  const del = (id: string, context = logbook(), opened = open(id, context)) =>
    buildSessionDelete(opened, context, makeDeps());

  it('K20 delete: tombstones for every live shot, series, fält station and the session; nothing else but the firearm', () => {
    const changes = changesOf(del('s1'));
    expect(changes.map((c) => [c.tableName, c.rowId, c.payload])).toEqual([
      ['firearms', 'f1', expect.objectContaining({ round_count: 78, rounds_since_maintenance: 0 })],
      ['sessions', 's1', null],
      ['series', 'r1', null],
      ['series', 'r2', null],
      ['series', 'rF', null],
      ['series', 'rT', null],
      ['shots', 'x1', null],
      ['shots', 'x2', null],
      ['shots', 'x3', null],
      ['shots', 'x4', null],
      ['shots', 'x5', null],
      ['shots', 'y1', null],
      ['shots', 'y2', null],
      ['shots', 'z1', null],
      ['shots', 'z2', null],
      ['shots', 'z3', null],
    ]);
    for (const change of changes) {
      expect(ClientChangeSchema.safeParse(change).success).toBe(true);
      if (change.payload === null) expect(change.deletedAt).toBe(NOW);
    }
    const falt = changesOf(del('s2'));
    expect(falt.map((c) => [c.tableName, c.rowId])).toEqual([
      ['firearms', 'f2'],
      ['sessions', 's2'],
      ['falt_stations', 'st1'],
      ['falt_stations', 'st2'],
      ['falt_stations', 'st3'],
    ]);
  });

  it('K20 delete leaves other sessions alone and lists the moved firearm with every tombstone', () => {
    const result = del('s3');
    expect(result).toEqual({
      ok: true,
      changes: [
        expect.objectContaining({ tableName: 'firearms', rowId: 'f2' }),
        expect.objectContaining({ tableName: 'sessions', rowId: 's3', payload: null }),
      ],
      moved: [{ firearmId: 'f2', rows: [{ tableName: 'sessions', rowId: 's3' }] }],
    });
  });

  it('K21 delete moves the firearm by −V_before floored; none, not live, or 0 → no firearm row', () => {
    expect(find(changesOf(del('s3')), 'firearms', 'f2')!.payload).toMatchObject({
      round_count: 0,
      rounds_since_maintenance: 0,
    });
    expect(find(changesOf(del('sDec')), 'firearms', 'f1')!.payload).toMatchObject({
      round_count: 99,
      rounds_since_maintenance: 19,
    });
    const context = logbook();
    const sessions = context.sessions as Map<string, Payload>;
    sessions.set('s1', { ...sessions.get('s1')!, firearm_id: 'fx' });
    expect(changesOf(del('s1', context)).some((c) => c.tableName === 'firearms')).toBe(false);
    // sH has no firearm; give it one with nothing shot.
    expect(changesOf(del('sH')).some((c) => c.tableName === 'firearms')).toBe(false);
    sessions.set('s4', session('s4', { firearm_id: 'f1' }));
    expect(changesOf(del('s4', context)).map((c) => c.tableName)).toEqual(['sessions']);
  });

  it('K22 delete leaves session_tags and every photo column alone', () => {
    const changes = changesOf(del('s1'));
    expect(
      changes.every((c) => ['firearms', 'sessions', 'series', 'shots'].includes(c.tableName)),
    ).toBe(true);
    // A tombstone carries no payload, so no photo column is written.
    expect(changes.filter((c) => c.tableName === 'series').every((c) => c.payload === null)).toBe(
      true,
    );
  });

  it('K23 delete of a session not live → gone; over 500 changes → tooManyChanges', () => {
    const deleted = logbook();
    const sessions = deleted.sessions as Map<string, Payload>;
    sessions.set('s1', { ...sessions.get('s1')!, deleted_at: NOW });
    expect(del('s1', deleted, open('s1'))).toEqual({ ok: false, errors: [{ kind: 'gone' }] });
    const absent = logbook();
    (absent.sessions as Map<string, Payload>).delete('s1');
    expect(del('s1', absent, open('s1'))).toEqual({ ok: false, errors: [{ kind: 'gone' }] });
    const context = logbook();
    (context.sessions as Map<string, Payload>).set('big', session('big'));
    (context.series as Map<string, Payload>).set('bigR', series('bigR', 'big', 1));
    const shots = context.shots as Map<string, Payload>;
    for (let i = 1; i <= 498; i += 1) shots.set(`b${i}`, shot(`b${i}`, 'bigR', i, 90));
    // session + series + 498 shots = 500.
    expect(changesOf(del('big', context))).toHaveLength(PUSH_BATCH_MAX);
    shots.set('b499', shot('b499', 'bigR', 499, 90));
    expect(del('big', context)).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX, needed: PUSH_BATCH_MAX + 1 }],
    });
  });
});

describe('K24 delete refuses what changed since the page opened (R10)', () => {
  const STALE = { ok: false, errors: [{ kind: 'stale' }] };

  /** Delete `id` as opened from the base logbook, over a fresh pull `change` altered. */
  function delAfter(
    id: string,
    change: (fresh: { [K in keyof EditContext]: Map<string, Payload> }) => void,
  ) {
    const fresh = logbook() as { [K in keyof EditContext]: Map<string, Payload> };
    change(fresh);
    return buildSessionDelete(open(id), fresh, makeDeps());
  }
  const patch = (map: Map<string, Payload>, id: string, fields: Payload) =>
    map.set(id, { ...map.get(id)!, ...fields });

  it('K24 the session row changed → stale, nothing built', () => {
    expect(delAfter('s1', (f) => patch(f.sessions, 's1', { notes: 'calm' }))).toEqual(STALE);
    expect(delAfter('s1', (f) => patch(f.sessions, 's1', { updated_at: NOW }))).toEqual(STALE);
    // A column only the fresh pull has.
    expect(delAfter('s1', (f) => patch(f.sessions, 's1', { newer_column: 1 }))).toEqual(STALE);
  });

  it('K24 any series row or its live shot ids changed, a final and a total-only included → stale', () => {
    for (const change of [
      (f: Parameters<Parameters<typeof delAfter>[1]>[0]) =>
        patch(f.series, 'r2', { is_sighter: 0 }),
      (f: Parameters<Parameters<typeof delAfter>[1]>[0]) => patch(f.series, 'rF', { note: 'x' }),
      (f: Parameters<Parameters<typeof delAfter>[1]>[0]) =>
        patch(f.series, 'rT', { total_override_shot_count: 9 }),
      (f: Parameters<Parameters<typeof delAfter>[1]>[0]) =>
        patch(f.shots, 'x1', { deleted_at: NOW }),
      (f: Parameters<Parameters<typeof delAfter>[1]>[0]) =>
        f.shots.set('y3', shot('y3', 'r2', 3, 60)),
      (f: Parameters<Parameters<typeof delAfter>[1]>[0]) =>
        f.shots.set('z4', shot('z4', 'rF', 4, 60)),
      // The phone's re-entry at the same count: one shot replaced, the series row untouched.
      (f: Parameters<Parameters<typeof delAfter>[1]>[0]) => {
        patch(f.shots, 'x1', { deleted_at: NOW });
        f.shots.set('x6', shot('x6', 'r1', 1, 100));
      },
    ]) {
      expect(delAfter('s1', change)).toEqual(STALE);
    }
  });

  it('K24 a series added or removed meanwhile → stale', () => {
    expect(delAfter('s1', (f) => f.series.set('rNew', series('rNew', 's1', 6)))).toEqual(STALE);
    expect(delAfter('s1', (f) => patch(f.series, 'r2', { deleted_at: NOW }))).toEqual(STALE);
    expect(delAfter('s1', (f) => f.series.delete('r2'))).toEqual(STALE);
    // One removed and one added: the same count, other rows.
    expect(
      delAfter('s1', (f) => {
        f.series.delete('r2');
        f.series.set('rNew', series('rNew', 's1', 6));
      }),
    ).toEqual(STALE);
    expect(
      delAfter('s2', (f) => {
        f.faltStations.delete('st2');
        f.faltStations.set('st4', station('st4', 's2'));
      }),
    ).toEqual(STALE);
    // A series with no shots, added meanwhile, still holds rounds the page never showed.
    expect(delAfter('s3', (f) => f.series.set('n1', series('n1', 's3', 1)))).toEqual(STALE);
  });

  it('K24 a fält station added, removed or changed meanwhile → stale', () => {
    expect(delAfter('s2', (f) => f.faltStations.set('st4', station('st4', 's2')))).toEqual(STALE);
    expect(delAfter('s2', (f) => patch(f.faltStations, 'st1', { deleted_at: NOW }))).toEqual(STALE);
    expect(delAfter('s2', (f) => f.faltStations.delete('st2'))).toEqual(STALE);
    expect(delAfter('s2', (f) => patch(f.faltStations, 'st3', { position: 4 }))).toEqual(STALE);
  });

  it('K24 gone wins over stale', () => {
    expect(
      delAfter('s1', (f) => {
        patch(f.series, 'r2', { is_sighter: 0 });
        patch(f.sessions, 's1', { deleted_at: NOW });
      }),
    ).toEqual({ ok: false, errors: [{ kind: 'gone' }] });
  });

  it('K24 rows of other sessions and the firearm row do not make it stale; the move starts from the fresh counter', () => {
    const result = delAfter('s1', (f) => {
      patch(f.sessions, 's3', { notes: 'other' });
      patch(f.series, 'h2', { is_sighter: 1 });
      f.shots.set('k2', shot('k2', 'h2', 2, 80));
      f.faltStations.set('st9', station('st9', 's2'));
      patch(f.faltStations, 'st1', { position: 7 });
      patch(f.firearms, 'f1', { round_count: 200 });
      // A deleted row of the session changing again is not a live change.
      patch(f.series, 'rGone', { note: 'still deleted' });
      patch(f.shots, 'xDead', { updated_at: NOW });
    });
    expect(find(changesOf(result), 'firearms', 'f1')!.payload).toMatchObject({
      round_count: 178,
      rounds_since_maintenance: 0,
    });
    expect(changesOf(result)).toHaveLength(
      changesOf(buildSessionDelete(open('s1'), logbook(), makeDeps())).length,
    );
  });

  it('K24 the opened snapshot names the session: its id, not a fresh one, is deleted', () => {
    const changes = changesOf(buildSessionDelete(open('s3'), logbook(), makeDeps()));
    expect(changes.map((c) => [c.tableName, c.rowId])).toEqual([
      ['firearms', 'f2'],
      ['sessions', 's3'],
    ]);
  });
});

// --- K18: for any draft over a random logbook, the built edit applied to the
// fresh rows yields what the draft shows, touches no other session, and moves
// each firearm as K11 says. The oracle is written apart from the builder.

type Tables = { [K in keyof EditContext]: Map<string, Payload> };

function applied(context: EditContext, changes: Change[]): Tables {
  const next = Object.fromEntries(
    Object.entries(context).map(([k, v]) => [k, new Map(v as Map<string, Payload>)]),
  ) as Tables;
  const table: Record<string, Map<string, Payload>> = {
    sessions: next.sessions,
    series: next.series,
    shots: next.shots,
    falt_stations: next.faltStations,
    firearms: next.firearms,
  };
  for (const change of changes) {
    const target = table[change.tableName];
    if (!target) throw new Error(`unexpected table ${change.tableName}`);
    if (change.payload === null) target.delete(change.rowId);
    else target.set(change.rowId, change.payload);
  }
  return next;
}

const liveShotValues = (tables: EditContext, seriesId: string): number[] =>
  [...tables.shots.values()]
    .filter((s) => s.series_id === seriesId && s.deleted_at === null)
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((s) => (s.value_tenths as number) + (s.is_inner_ten === 1 ? 0.5 : 0));

/** Rounds by hand: live series' shots (total-only by count), extra rounds, 6 per station. */
function oracleRounds(tables: EditContext, sessionId: string): number {
  const s = tables.sessions.get(sessionId)!;
  let rounds = (s.extra_rounds as number | null) ?? 0;
  for (const row of tables.series.values()) {
    if (row.session_id !== sessionId || row.deleted_at !== null) continue;
    rounds +=
      row.is_total_override === 1
        ? ((row.total_override_shot_count as number | null) ?? 5)
        : liveShotValues(tables, row.id as string).length;
  }
  for (const st of tables.faltStations.values()) {
    if (st.session_id === sessionId && st.deleted_at === null) rounds += 6;
  }
  return rounds;
}

const VALUES = [0, 5, 7, 8, 9, 10];
const rowArb = fc.array(fc.constantFrom(...VALUES, 11), { maxLength: 5 });
const asText = (shots: number[]) => shots.map((v) => (v === 11 ? 'X' : String(v))).join(' ');
const asTenths = (shots: number[]) => shots.map((v) => (v === 11 ? 100.5 : v * 10));

describe('K18 the built edit applied yields what the draft shows', () => {
  it('K18 property over random logbooks and drafts', () => {
    fc.assert(
      fc.property(
        fc.record({
          existing: fc.array(fc.record({ shots: rowArb, sighter: fc.boolean() }), {
            maxLength: 4,
          }),
          edits: fc.array(
            fc.record({
              shots: rowArb,
              sighter: fc.boolean(),
              deleted: fc.boolean(),
              keep: fc.boolean(),
            }),
            { maxLength: 4 },
          ),
          added: fc.array(fc.record({ shots: rowArb, sighter: fc.boolean() }), { maxLength: 2 }),
          firearm: fc.constantFrom(null, 'f1', 'f2', 'fx'),
          target: fc.constantFrom(undefined, null, 'f1', 'f2', 'f3'),
          extra: fc.option(fc.nat({ max: 9 }), { nil: null }),
          counters: fc.tuple(fc.nat({ max: 30 }), fc.nat({ max: 30 }), fc.nat({ max: 30 })),
          location: fc.constantFrom(undefined, 'Range Z', ''),
        }),
        (w) => {
          const context: Tables = {
            sessions: byId(
              session('e', { firearm_id: w.firearm, extra_rounds: w.extra }),
              session('other', { firearm_id: 'f1' }),
            ),
            series: byId(series('oR', 'other', 1)),
            shots: byId(shot('o1', 'oR', 1, 90)),
            faltStations: new Map(),
            firearms: byId(
              firearm('f1', w.counters[0], w.counters[1]),
              firearm('f2', w.counters[1], w.counters[2]),
              firearm('f3', w.counters[2], w.counters[0]),
              firearm('fx', 4, 4, OLD),
            ),
            ammoLots: new Map(),
          };
          // At most one sighter among the existing rows, as the phone allows.
          let sighterSeen = false;
          w.existing.forEach((row, i) => {
            const sighter = row.sighter && !sighterSeen;
            sighterSeen ||= sighter;
            context.series.set(
              `r${i}`,
              series(`r${i}`, 'e', i + 1, { is_sighter: sighter ? 1 : 0 }),
            );
            row.shots.forEach((v, k) => {
              const t = asTenths([v])[0]!;
              context.shots.set(
                `r${i}s${k}`,
                shot(`r${i}s${k}`, `r${i}`, k + 1, Math.floor(t), v === 11),
              );
            });
          });

          const opened = openedSession('e', context)!;
          const rows: SeriesEditDraft[] = w.existing.map((row, i) => {
            const change = w.edits[i];
            if (!change || change.keep)
              return asDrafted(
                `r${i}`,
                asText(row.shots),
                opened.series.get(`r${i}`)!.row.is_sighter === 1,
              );
            return {
              id: `r${i}`,
              text: asText(change.shots),
              isSighter: change.sighter,
              deleted: change.deleted,
            };
          });
          for (const row of w.added) {
            rows.push({
              id: null,
              text: asText(row.shots),
              isSighter: row.sighter,
              deleted: false,
            });
          }
          const fields: SessionEditDraft['fields'] = {};
          if (w.target !== undefined) fields.firearmId = w.target;
          if (w.location !== undefined) fields.location = w.location;
          const result = buildSessionEdit(
            { sessionId: 'e', fields, series: rows },
            opened,
            context,
            makeDeps(),
          );

          // What the draft shows: live rows after the edit, by position.
          const shown = rows.filter((r) => !r.deleted && (r.id !== null || r.text.trim() !== ''));
          const sighters = shown.filter((r) => r.isSighter).length;
          if (sighters > 1) {
            expect(result.ok).toBe(false);
            if (!result.ok)
              expect(result.errors.every((e) => e.kind === 'secondSighter')).toBe(true);
            return;
          }
          if (!result.ok) {
            expect(result.errors).toEqual([{ kind: 'nothingToChange' }]);
            return;
          }
          const after = applied(context, changesOf(result));

          const liveSeries = [...after.series.values()]
            .filter((s) => s.session_id === 'e' && s.deleted_at === null)
            .sort((a, b) => (a.position as number) - (b.position as number));
          expect(
            liveSeries.map((s) => [liveShotValues(after, s.id as string), s.is_sighter]),
          ).toEqual(
            shown.map((r) => [
              asTenths(
                r.text === '' ? [] : r.text.split(' ').map((t) => (t === 'X' ? 11 : Number(t))),
              ),
              r.isSighter ? 1 : 0,
            ]),
          );
          const s = after.sessions.get('e')!;
          expect(s.firearm_id).toBe(w.target === undefined ? w.firearm : w.target);
          if (w.location !== undefined) expect(s.location).toBe(w.location || null);

          // No live shot is left under a deleted series, as tombstoneSeries.
          for (const live of after.shots.values()) {
            expect(after.series.has(live.series_id as string)).toBe(true);
          }

          // Nothing outside the session moved, but the firearms.
          expect(after.sessions.get('other')).toBe(context.sessions.get('other'));
          expect(after.series.get('oR')).toBe(context.series.get('oR'));
          expect(after.shots.get('o1')).toBe(context.shots.get('o1'));
          for (const change of changesOf(result)) {
            if (change.tableName === 'series' && change.payload)
              expect(change.payload.session_id).toBe('e');
          }

          // Counters as K11 says.
          const vBefore = oracleRounds(context, 'e');
          const vAfter = oracleRounds(after, 'e');
          const from = w.firearm;
          const to = w.target === undefined ? w.firearm : w.target;
          const live = (id: string | null): id is string => id !== null && id !== 'fx';
          const expected = new Map<string, number>();
          const move = (id: string | null, d: number) => {
            if (live(id)) expected.set(id, (expected.get(id) ?? 0) + d);
          };
          if (from === to) move(from, vAfter - vBefore);
          else {
            move(from, -vBefore);
            move(to, vAfter);
          }
          for (const id of ['f1', 'f2', 'f3']) {
            const start = context.firearms.get(id)!;
            const d = expected.get(id) ?? 0;
            expect(after.firearms.get(id)!.round_count).toBe(
              Math.max(0, (start.round_count as number) + d),
            );
            expect(after.firearms.get(id)!.rounds_since_maintenance).toBe(
              Math.max(0, (start.rounds_since_maintenance as number) + d),
            );
            if (d === 0) expect(after.firearms.get(id)).toBe(start);
          }
        },
      ),
      { numRuns: 400 },
    );
  });
});

// --- Revision 2 (§10, #769): fält stations and Rounds Fired.

const fullStation = (id: string, sessionId: string, position: number, fields: Payload = {}) => ({
  ...common(id),
  session_id: sessionId,
  position,
  hits: 4,
  figures_hit: 3,
  figure_count: 4,
  points: null,
  points_max: null,
  is_scratched: 0,
  is_shoot_off: 0,
  photo_uri: null,
  note: null,
  // A column this build does not know must survive a rewrite.
  future_column: 'kept',
  ...fields,
});

/**
 * sF: fält on f2 (counter 40), stations at positions 1, 2 and 4 (3 was
 * removed on the phone: a gap), fB at 2 with a photo and a note.
 * sFO: fält whose last station is a shoot-off. sR: rounds only on f1, 25
 * rounds. sRF: a rounds-only fält session with no station. sBig: rounds only,
 * 12 000 rounds stored by the phone.
 */
function faltBook(): EditContext {
  const book = logbook();
  const sessions = book.sessions as Map<string, Payload>;
  sessions.set('sF', session('sF', { discipline_id: 'spsf-falt', firearm_id: 'f2' }));
  sessions.set('sFO', session('sFO', { discipline_id: 'spsf-falt' }));
  sessions.set('sR', session('sR', { kind: 'rounds', firearm_id: 'f1', extra_rounds: 25 }));
  sessions.set(
    'sRF',
    session('sRF', { kind: 'rounds', discipline_id: 'spsf-falt', firearm_id: 'f3' }),
  );
  sessions.set('sBig', session('sBig', { kind: 'rounds', extra_rounds: 12_000 }));
  const stations = book.faltStations as Map<string, Payload>;
  for (const row of [
    fullStation('fA', 'sF', 1),
    fullStation('fB', 'sF', 2, { photo_uri: 'station-photo', note: 'windy' }),
    fullStation('fGone', 'sF', 3, { deleted_at: OLD }),
    fullStation('fD', 'sF', 4, { hits: 0, figures_hit: 0 }),
    fullStation('oA', 'sFO', 1),
    fullStation('oB', 'sFO', 2, { is_shoot_off: 1 }),
  ]) {
    stations.set(row.id, row);
  }
  (book.firearms as Map<string, Payload>).set('f2', firearm('f2', 40, 40));
  return book;
}

/** The draft row the form shows for an opened station, unchanged. */
const stationDrafted = (row: Payload): StationEditDraft => ({
  id: row.id as string,
  hits: row.hits as number,
  figuresHit: row.figures_hit as number,
  figureCount: row.figure_count as number | null,
  pointsText: row.points === null ? '' : String(Number(row.points)),
  pointsMaxText: row.points_max === null ? '' : String(Number(row.points_max)),
  isScratched: row.is_scratched === 1,
  isShootOff: row.is_shoot_off === 1,
  deleted: false,
});

const newStationDraft = (fields: Partial<StationEditDraft> = {}): StationEditDraft => ({
  id: null,
  hits: 5,
  figuresHit: 3,
  figureCount: 4,
  pointsText: '',
  pointsMaxText: '',
  isScratched: false,
  isShootOff: false,
  deleted: false,
  ...fields,
});

/** Every opened station of the session as drafted, with `patch` applied by id. */
function stationsDraft(
  context: EditContext,
  sessionId: string,
  patch: Record<string, Partial<StationEditDraft>> = {},
  added: StationEditDraft[] = [],
): StationEditDraft[] {
  return [
    ...open(sessionId, context)
      .stations.slice()
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map((row) => ({ ...stationDrafted(row), ...patch[row.id as string] })),
    ...added,
  ];
}

const stationEdit = (
  sessionId: string,
  stations: StationEditDraft[],
  fields: SessionEditDraft['fields'] = {},
): SessionEditDraft => ({ sessionId, fields, series: [], stations });

const roundsEdit = (
  sessionId: string,
  roundsFired: string,
  fields: SessionEditDraft['fields'] = {},
): SessionEditDraft => ({ sessionId, fields, series: [], roundsFired });

const counter = (changes: Change[], firearmId: string) =>
  find(changes, 'firearms', firearmId)?.payload?.round_count;

describe('station edit (§10)', () => {
  it('K26 a changed station: the fresh payload with the updateStation columns and updated_at replaced; the rest survives', () => {
    const context = faltBook();
    const opened = open('sF', context);
    const d = stationEdit(
      'sF',
      stationsDraft(context, 'sF', {
        fB: { hits: 6, figuresHit: 4, figureCount: 5, pointsText: '7', pointsMaxText: '10' },
      }),
    );
    const changes = changesOf(edit(d, context, opened));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ tableName: 'falt_stations', rowId: 'fB' });
    expect(changes[0]!.payload).toEqual({
      ...context.faltStations.get('fB'),
      hits: 6,
      figures_hit: 4,
      figure_count: 5,
      points: 7,
      points_max: 10,
      is_scratched: 0,
      updated_at: NOW,
    });
    expect(changes[0]!.payload).toMatchObject({
      photo_uri: 'station-photo',
      note: 'windy',
      is_shoot_off: 0,
      position: 2,
      session_id: 'sF',
      future_column: 'kept',
      created_at: OLD,
    });
  });

  it('K26 the spread is the fresh row, not the opened one; an unchanged station writes nothing', () => {
    const context = faltBook();
    const opened = open('sF', context);
    // The opened snapshot is a copy; the fresh row is a distinct object with equal values.
    (context.faltStations as Map<string, Payload>).set('fA', {
      ...context.faltStations.get('fA')!,
    });
    const changes = changesOf(
      edit(
        stationEdit('sF', stationsDraft(context, 'sF', { fA: { isScratched: true } })),
        context,
        opened,
      ),
    );
    expect(changes.map((c) => c.rowId)).toEqual(['fA']);
    expect(changes[0]!.payload).not.toBe(context.faltStations.get('fA'));
    expect(changes[0]!.payload!.is_scratched).toBe(1);
    expect(edit(stationEdit('sF', stationsDraft(context, 'sF')), context, opened)).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
  });

  it('K26 an opened shoot-off flag is never written from the draft', () => {
    const context = faltBook();
    const d = stationEdit(
      'sFO',
      stationsDraft(context, 'sFO', {
        oA: { isShootOff: true, hits: 5 },
        oB: { isShootOff: false, hits: 5 },
      }),
    );
    const changes = changesOf(edit(d, context));
    expect(find(changes, 'falt_stations', 'oA')!.payload!.is_shoot_off).toBe(0);
    expect(find(changes, 'falt_stations', 'oB')!.payload!.is_shoot_off).toBe(1);
  });

  it('K27 a new station: every column as addStation, at max(fresh live position) + 1, then +1 per new row', () => {
    const context = faltBook();
    const d = stationEdit(
      'sF',
      stationsDraft(context, 'sF', {}, [
        newStationDraft({ pointsText: '8', pointsMaxText: '10' }),
        newStationDraft({ hits: 0, figuresHit: 0, figureCount: null }),
      ]),
    );
    const changes = changesOf(edit(d, context));
    const added = changes.filter((c) => c.tableName === 'falt_stations');
    expect(added).toHaveLength(2);
    expect(added[0]!.payload).toEqual({
      id: added[0]!.rowId,
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      session_id: 'sF',
      position: 5,
      hits: 5,
      figures_hit: 3,
      figure_count: 4,
      points: 8,
      points_max: 10,
      is_scratched: 0,
      is_shoot_off: 0,
      photo_uri: null,
      note: null,
    });
    // A 0-hit row is a result and is saved (#713 R8).
    expect(added[1]!.payload).toMatchObject({ position: 6, hits: 0, figures_hit: 0 });
    expect(new Set(added.map((c) => c.rowId)).size).toBe(2);
  });

  it('K27 the position counts the fresh pull: a station the phone tombstoned at the end still leaves its number taken', () => {
    const context = faltBook();
    // The last live station is 4; 3 is a gap.
    const d = stationEdit(
      'sF',
      stationsDraft(context, 'sF', { fD: { deleted: true } }, [newStationDraft()]),
    );
    const changes = changesOf(edit(d, context));
    const added = changes.find((c) => c.tableName === 'falt_stations' && c.payload !== null)!;
    expect(added.payload!.position).toBe(5);
  });

  it('K27 a new row with nothing entered, a bare started shoot-off, or one added and removed again writes nothing', () => {
    const context = faltBook();
    const blank = newStationDraft({ hits: null, figuresHit: 0, figureCount: null });
    for (const row of [
      blank,
      { ...blank, isShootOff: true },
      { ...blank, pointsText: '  ' },
      newStationDraft({ deleted: true }),
      newStationDraft({ deleted: true, pointsText: 'x' }),
    ]) {
      expect(edit(stationEdit('sF', stationsDraft(context, 'sF', {}, [row])), context)).toEqual({
        ok: false,
        errors: [{ kind: 'nothingToChange' }],
      });
    }
    // Figures alone, points alone, or Scratched alone is an entry.
    for (const row of [
      { ...blank, figureCount: 3 },
      { ...blank, pointsText: '4' },
      { ...blank, isScratched: true },
    ]) {
      const added = changesOf(
        edit(stationEdit('sF', stationsDraft(context, 'sF', {}, [row])), context),
      );
      expect(added.filter((c) => c.tableName === 'falt_stations')).toHaveLength(1);
      expect(added.find((c) => c.tableName === 'falt_stations')!.payload!.hits).toBe(0);
    }
  });

  it('K28 a removed station: one tombstone, no other station written, the rest keep their positions', () => {
    const context = faltBook();
    const changes = changesOf(
      edit(stationEdit('sF', stationsDraft(context, 'sF', { fB: { deleted: true } })), context),
    );
    const stations = changes.filter((c) => c.tableName === 'falt_stations');
    expect(stations).toEqual([
      {
        clientChangeId: expect.any(String) as string,
        tableName: 'falt_stations',
        rowId: 'fB',
        payload: null,
        deletedAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });

  it('K29 an opened row with hits null, or one stationProblem rejects → invalidStation(row); bad points → stationPoints(row)', () => {
    const context = faltBook();
    const cases: [Record<string, Partial<StationEditDraft>>, StationEditDraft[], EditResult][] = [
      [{ fA: { hits: null } }, [], { ok: false, errors: [{ kind: 'invalidStation', row: 1 }] }],
      [
        { fB: { hits: 2, figuresHit: 3 } },
        [],
        { ok: false, errors: [{ kind: 'invalidStation', row: 2 }] },
      ],
      [
        { fD: { hits: 3, figuresHit: 0 } },
        [],
        { ok: false, errors: [{ kind: 'invalidStation', row: 3 }] },
      ],
      [{ fA: { hits: 7 } }, [], { ok: false, errors: [{ kind: 'invalidStation', row: 1 }] }],
      [{ fA: { figureCount: 2 } }, [], { ok: false, errors: [{ kind: 'invalidStation', row: 1 }] }],
      [{ fA: { pointsText: 'x' } }, [], { ok: false, errors: [{ kind: 'stationPoints', row: 1 }] }],
      [
        { fB: { pointsText: '9', pointsMaxText: '5' } },
        [],
        { ok: false, errors: [{ kind: 'stationPoints', row: 2 }] },
      ],
      [
        {},
        [newStationDraft({ hits: 2, figuresHit: 3 })],
        { ok: false, errors: [{ kind: 'invalidStation', row: 4 }] },
      ],
      [
        {},
        [newStationDraft({ pointsMaxText: 'y' })],
        { ok: false, errors: [{ kind: 'stationPoints', row: 4 }] },
      ],
      [
        { fA: { hits: null }, fD: { pointsText: '-1' } },
        [newStationDraft({ hits: 1, figuresHit: 0 })],
        {
          ok: false,
          errors: [
            { kind: 'invalidStation', row: 1 },
            { kind: 'stationPoints', row: 3 },
            { kind: 'invalidStation', row: 4 },
          ],
        },
      ],
    ];
    for (const [patch, added, expected] of cases) {
      expect(edit(stationEdit('sF', stationsDraft(context, 'sF', patch, added)), context)).toEqual(
        expected,
      );
    }
  });

  it('K29 an opened station emptied to nothing is refused, not dropped as a blank new row would be', () => {
    const context = faltBook();
    expect(
      edit(
        stationEdit('sF', stationsDraft(context, 'sF', { fD: { hits: null, figureCount: null } })),
        context,
      ),
    ).toEqual({ ok: false, errors: [{ kind: 'invalidStation', row: 3 }] });
    expect(
      edit(stationEdit('sF', stationsDraft(context, 'sF', { fD: { hits: null } })), context),
    ).toEqual({
      ok: false,
      errors: [{ kind: 'invalidStation', row: 3 }],
    });
  });

  it('K29 a removed row is not read; a scratched row with impossible numbers is saved, as on the phone', () => {
    const context = faltBook();
    expect(
      changesOf(
        edit(
          stationEdit('sF', stationsDraft(context, 'sF', { fA: { hits: null, deleted: true } })),
          context,
        ),
      ),
    ).toHaveLength(2);
    const scratched = changesOf(
      edit(
        stationEdit(
          'sF',
          stationsDraft(context, 'sF', { fA: { hits: 2, figuresHit: 0, isScratched: true } }),
        ),
        context,
      ),
    );
    expect(scratched[0]!.payload).toMatchObject({ hits: 2, figures_hit: 0, is_scratched: 1 });
  });

  it('K30 shoot-off: a new station after a kept shoot-off is one, whatever the draft says', () => {
    const context = faltBook();
    const changes = changesOf(
      edit(
        stationEdit(
          'sFO',
          stationsDraft(context, 'sFO', {}, [newStationDraft(), newStationDraft()]),
        ),
        context,
      ),
    );
    expect(
      changes.filter((c) => c.tableName === 'falt_stations').map((c) => c.payload!.is_shoot_off),
    ).toEqual([1, 1]);
  });

  it('K30 a new row the draft started as a shoot-off is one, and so is every new row after it', () => {
    const context = faltBook();
    const changes = changesOf(
      edit(
        stationEdit(
          'sF',
          stationsDraft(context, 'sF', {}, [
            newStationDraft(),
            newStationDraft({ isShootOff: true }),
            newStationDraft(),
          ]),
        ),
        context,
      ),
    );
    expect(
      changes
        .filter((c) => c.tableName === 'falt_stations')
        .map((c) => [c.payload!.position, c.payload!.is_shoot_off]),
    ).toEqual([
      [5, 0],
      [6, 1],
      [7, 1],
    ]);
  });

  it('K30 a removed last shoot-off does not make the next new row one; the kept rows decide by position', () => {
    const context = faltBook();
    const changes = changesOf(
      edit(
        stationEdit(
          'sFO',
          stationsDraft(context, 'sFO', { oB: { deleted: true } }, [newStationDraft()]),
        ),
        context,
      ),
    );
    const added = changes.find((c) => c.tableName === 'falt_stations' && c.payload !== null)!;
    expect(added.payload).toMatchObject({ position: 3, is_shoot_off: 0 });
    // Pulled out of position order, the last by position still decides.
    const shuffled = faltBook();
    const stations = shuffled.faltStations as Map<string, Payload>;
    const oA = stations.get('oA')!;
    stations.delete('oA');
    stations.set('oA', oA);
    const again = changesOf(
      edit(stationEdit('sFO', stationsDraft(shuffled, 'sFO', {}, [newStationDraft()])), shuffled),
    );
    expect(again.find((c) => c.tableName === 'falt_stations')!.payload!.is_shoot_off).toBe(1);
  });

  it('K31 counters: +6 per new kept station, −6 per removed, 0 for a changed or scratched one', () => {
    const context = faltBook();
    const run = (stations: StationEditDraft[]) =>
      counter(changesOf(edit(stationEdit('sF', stations), context)), 'f2');
    expect(run(stationsDraft(context, 'sF', {}, [newStationDraft(), newStationDraft()]))).toBe(52);
    expect(
      run(stationsDraft(context, 'sF', { fA: { deleted: true }, fB: { deleted: true } })),
    ).toBe(28);
    expect(
      run(stationsDraft(context, 'sF', { fA: { deleted: true } }, [newStationDraft()])),
    ).toBeUndefined();
    expect(
      run(stationsDraft(context, 'sF', { fA: { hits: 6, isScratched: true } })),
    ).toBeUndefined();
    // A blank new row adds nothing.
    expect(
      run(
        stationsDraft(context, 'sF', { fA: { hits: 6 } }, [
          newStationDraft({ hits: null, figureCount: null }),
        ]),
      ),
    ).toBeUndefined();
  });

  it('K31 counters net with a firearm change into one floored move per firearm (E19)', () => {
    const context = faltBook();
    // V_before 18 (three stations); V_after 24 (one removed, two added).
    const changes = changesOf(
      edit(
        stationEdit(
          'sF',
          stationsDraft(context, 'sF', { fA: { deleted: true } }, [
            newStationDraft(),
            newStationDraft(),
          ]),
          {
            firearmId: 'f1',
          },
        ),
        context,
      ),
    );
    expect(counter(changes, 'f2')).toBe(40 - 18);
    expect(counter(changes, 'f1')).toBe(100 + 24);
    expect(changes.filter((c) => c.tableName === 'firearms')).toHaveLength(2);
    // Floored once: a drifted counter of 5 loses all three stations' 18 at once.
    const drifted = faltBook();
    (drifted.firearms as Map<string, Payload>).set('f2', firearm('f2', 5, 5));
    const floored = changesOf(
      edit(
        stationEdit(
          'sF',
          stationsDraft(drifted, 'sF', {
            fA: { deleted: true },
            fB: { deleted: true },
            fD: { deleted: true },
          }),
        ),
        drifted,
      ),
    );
    expect(find(floored, 'firearms', 'f2')!.payload).toMatchObject({
      round_count: 0,
      rounds_since_maintenance: 0,
    });
  });

  it('K31 moved lists the firearm with the station rows (E8)', () => {
    const context = faltBook();
    const result = edit(
      stationEdit('sF', stationsDraft(context, 'sF', { fA: { deleted: true } })),
      context,
    );
    expect(result.ok && result.moved).toEqual([
      { firearmId: 'f2', rows: [{ tableName: 'falt_stations', rowId: 'fA' }] },
    ]);
  });

  it('K32 stale: when the draft writes a station, any station added, removed or changed since opening → stale', () => {
    const changed = (mutate: (stations: Map<string, Payload>) => void) => {
      const context = faltBook();
      const opened = open('sF', context);
      mutate(context.faltStations as Map<string, Payload>);
      return { context, opened };
    };
    const mutations: ((stations: Map<string, Payload>) => void)[] = [
      // An untouched station's note, edited on the phone.
      (s) => s.set('fD', { ...s.get('fD')!, note: 'phone' }),
      // A column only the fresh row has.
      (s) => s.set('fD', { ...s.get('fD')!, newer_key: 1 }),
      // Added on the phone.
      (s) => s.set('fNew', fullStation('fNew', 'sF', 5)),
      // Removed on the phone.
      (s) => s.set('fD', { ...s.get('fD')!, deleted_at: NOW }),
      (s) => s.delete('fD'),
    ];
    for (const mutate of mutations) {
      const { context, opened } = changed(mutate);
      for (const stations of [
        stationsDraft(faltBook(), 'sF', { fA: { hits: 6 } }),
        stationsDraft(faltBook(), 'sF', { fA: { deleted: true } }),
        stationsDraft(faltBook(), 'sF', {}, [newStationDraft()]),
      ]) {
        expect(edit(stationEdit('sF', stations), context, opened)).toEqual({
          ok: false,
          errors: [{ kind: 'stale' }],
        });
      }
    }
  });

  it('K32 a draft writing no station is not blocked by a station another device changed; other sessions do not count', () => {
    const context = faltBook();
    const opened = open('sF', context);
    const stations = context.faltStations as Map<string, Payload>;
    stations.set('fD', { ...stations.get('fD')!, note: 'phone' });
    stations.set('oA', { ...stations.get('oA')!, hits: 1 });
    const unchanged = stationsDraft(faltBook(), 'sF');
    expect(
      changesOf(edit(stationEdit('sF', unchanged, { location: 'X' }), context, opened)),
    ).toHaveLength(1);
    const otherOnly = open('sF', faltBook());
    stations.set('fD', faltBook().faltStations.get('fD')!);
    expect(
      changesOf(
        edit(
          stationEdit('sF', stationsDraft(faltBook(), 'sF', { fA: { hits: 6 } })),
          context,
          otherOnly,
        ),
      ),
    ).toHaveLength(1);
  });

  it('K34 a fält session never writes kind, discipline_id, falt_result_mode, program_id, decimal_scoring or series_length', () => {
    const context = faltBook();
    (context.sessions as Map<string, Payload>).set('sF', {
      ...context.sessions.get('sF')!,
      falt_result_mode: 'poangfalt',
    });
    const sneaky = {
      kind: 'rounds',
      disciplineId: 'spsf-precision',
      faltResultMode: 'falt',
      programId: 'x',
      decimalScoring: true,
      seriesLength: 10,
      name: 'Renamed',
    } as unknown as SessionEditDraft['fields'];
    const changes = changesOf(
      edit(
        stationEdit('sF', stationsDraft(context, 'sF', {}, [newStationDraft()]), sneaky),
        context,
      ),
    );
    const row = find(changes, 'sessions', 'sF')!.payload!;
    expect(row).toEqual({ ...context.sessions.get('sF'), name: 'Renamed', updated_at: NOW });
  });

  it('K34 stations on a session not scored in hits, or a station the form did not open, is a programming error', () => {
    const context = faltBook();
    expect(() => edit(stationEdit('s1', [newStationDraft()]), context)).toThrow(
      new RangeError('spsf-precision is not scored in hits'),
    );
    expect(() => edit(stationEdit('sF', [{ ...newStationDraft(), id: 'oA' }]), context)).toThrow(
      /oA is not one the form opened/,
    );
    // An empty list on a ring session reads no rules.
    expect(changesOf(edit(stationEdit('s1', [], { location: 'Y' }), context))).toHaveLength(1);
  });
});

describe('rounds edit (§10)', () => {
  it('K35 Rounds Fired moves the counter by the difference, as setSessionExtraRounds', () => {
    const context = faltBook();
    const cases: [string, number | null, number][] = [
      ['40', 40, 115],
      [' 10 ', 10, 85],
      ['', null, 75],
      ['0', 0, 75],
    ];
    for (const [typed, stored, count] of cases) {
      const changes = changesOf(edit(roundsEdit('sR', typed), context));
      expect(find(changes, 'sessions', 'sR')!.payload).toEqual({
        ...context.sessions.get('sR'),
        extra_rounds: stored,
        updated_at: NOW,
      });
      expect(counter(changes, 'f1')).toBe(count);
    }
    expect(edit(roundsEdit('sR', '25'), context)).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    expect(edit(roundsEdit('sR', ' 25'), context)).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
  });

  it('K35 floored, and netted with a firearm change', () => {
    const context = faltBook();
    (context.firearms as Map<string, Payload>).set('f1', firearm('f1', 10, 3));
    const down = changesOf(edit(roundsEdit('sR', '5'), context));
    expect(find(down, 'firearms', 'f1')!.payload).toMatchObject({
      round_count: 0,
      rounds_since_maintenance: 0,
    });
    const moved = changesOf(edit(roundsEdit('sR', '30', { firearmId: 'f3' }), context));
    expect(counter(moved, 'f1')).toBe(0);
    expect(counter(moved, 'f3')).toBe(35);
  });

  it('K36 not plain digits up to 10 000 → invalidRounds, nothing built; 10 000 is accepted', () => {
    const context = faltBook();
    for (const typed of ['-3', '2.5', 'abc', '1e2', '+5', '10001', '0x10']) {
      expect(edit(roundsEdit('sR', typed, { name: 'X' }), context)).toEqual({
        ok: false,
        errors: [{ kind: 'invalidRounds' }],
      });
    }
    expect(
      find(changesOf(edit(roundsEdit('sR', '10000'), context)), 'sessions', 'sR')!.payload!
        .extra_rounds,
    ).toBe(10_000);
  });

  it('K36 a stored count over the limit the draft does not change does not block a name edit', () => {
    const context = faltBook();
    const changes = changesOf(edit(roundsEdit('sBig', '12000', { name: 'Renamed' }), context));
    expect(find(changes, 'sessions', 'sBig')!.payload).toMatchObject({
      name: 'Renamed',
      extra_rounds: 12_000,
    });
    expect(edit(roundsEdit('sBig', '12001'), context)).toEqual({
      ok: false,
      errors: [{ kind: 'invalidRounds' }],
    });
    // Spaces around the stored count are the same count, not a change.
    expect(
      find(
        changesOf(edit(roundsEdit('sBig', ' 12000 ', { name: 'N' }), context)),
        'sessions',
        'sBig',
      )!.payload!.extra_rounds,
    ).toBe(12_000);
  });

  it('K37 a session that is not rounds-only ignores Rounds Fired: extra_rounds is never written', () => {
    const context = faltBook();
    expect(edit(roundsEdit('s1', '99'), context)).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    expect(edit(roundsEdit('sF', 'abc'), context)).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    const named = changesOf(edit(roundsEdit('s1', '99', { name: 'N' }), context));
    expect(find(named, 'sessions', 's1')!.payload!.extra_rounds).toBe(2);
  });

  it("K33 stale: the session's extra_rounds changed on another device since opening → stale, whatever the draft edits", () => {
    const context = faltBook();
    const opened = open('sR', context);
    (context.sessions as Map<string, Payload>).set('sR', {
      ...context.sessions.get('sR')!,
      extra_rounds: 30,
    });
    for (const d of [roundsEdit('sR', '40'), roundsEdit('sR', '25', { name: 'N' })]) {
      expect(edit(d, context, opened)).toEqual({ ok: false, errors: [{ kind: 'stale' }] });
    }
  });

  it('E18 a rounds-only fält session takes both: Rounds Fired and stations in one save, one move', () => {
    const context = faltBook();
    const changes = changesOf(
      edit(
        {
          sessionId: 'sRF',
          fields: {},
          series: [],
          roundsFired: '12',
          stations: [newStationDraft(), newStationDraft()],
        },
        context,
      ),
    );
    expect(find(changes, 'sessions', 'sRF')!.payload!.extra_rounds).toBe(12);
    expect(
      changes.filter((c) => c.tableName === 'falt_stations').map((c) => c.payload!.position),
    ).toEqual([1, 2]);
    expect(counter(changes, 'f3')).toBe(5 + 12 + 12);
    expect(changes.filter((c) => c.tableName === 'firearms')).toHaveLength(1);
  });
});

// --- K38: for a random fält or rounds session and a random draft, the built
// edit applied to the fresh rows yields the stations and extra_rounds the
// draft shows, touches no other session, and moves each firearm by E19.

const stationArb = fc.record({
  hits: fc.integer({ min: 0, max: 6 }),
  scratched: fc.boolean(),
  points: fc.option(fc.nat({ max: 12 }), { nil: null }),
});

describe('K38 the built station and rounds edit applied yields what the draft shows', () => {
  it('K38 property over random fält and rounds sessions and drafts', () => {
    fc.assert(
      fc.property(
        fc.record({
          rounds: fc.boolean(),
          existing: fc.array(
            fc.record({ station: stationArb, shootOff: fc.boolean(), gap: fc.nat({ max: 2 }) }),
            {
              maxLength: 4,
            },
          ),
          edits: fc.array(
            fc.record({ station: stationArb, deleted: fc.boolean(), keep: fc.boolean() }),
            { maxLength: 4 },
          ),
          added: fc.array(
            fc.record({ station: stationArb, shootOff: fc.boolean(), blank: fc.boolean() }),
            {
              maxLength: 3,
            },
          ),
          extra: fc.option(fc.nat({ max: 50 }), { nil: null }),
          typed: fc.constantFrom(undefined, '', '0', '7', '33', '10000'),
          firearm: fc.constantFrom(null, 'f1', 'f2'),
          target: fc.constantFrom(undefined, null, 'f1', 'f3'),
          counters: fc.tuple(fc.nat({ max: 60 }), fc.nat({ max: 60 }), fc.nat({ max: 60 })),
        }),
        (w) => {
          const context: Tables = {
            sessions: byId(
              session('e', {
                discipline_id: 'spsf-falt',
                kind: w.rounds ? 'rounds' : 'series',
                firearm_id: w.firearm,
                extra_rounds: w.extra,
              }),
              session('other', { discipline_id: 'spsf-falt', firearm_id: 'f1' }),
            ),
            series: new Map(),
            shots: new Map(),
            faltStations: byId(fullStation('oS', 'other', 1)),
            firearms: byId(
              firearm('f1', w.counters[0], w.counters[1]),
              firearm('f2', w.counters[1], w.counters[2]),
              firearm('f3', w.counters[2], w.counters[0]),
            ),
            ammoLots: new Map(),
          };
          // Once a shoot-off starts, every later station is one, as the phone saves them.
          let position = 0;
          let shootOff = false;
          w.existing.forEach((row, i) => {
            position += 1 + row.gap;
            shootOff ||= row.shootOff;
            context.faltStations.set(
              `t${i}`,
              fullStation(`t${i}`, 'e', position, {
                hits: row.station.hits,
                figures_hit: Math.min(row.station.hits, 1),
                figure_count: null,
                is_scratched: row.station.scratched ? 1 : 0,
                is_shoot_off: shootOff ? 1 : 0,
                points: row.station.points,
              }),
            );
          });
          const opened = openedSession('e', context)!;
          const asDraft = (s: (typeof w.existing)[number]['station']) => ({
            hits: s.hits,
            figuresHit: Math.min(s.hits, 1),
            figureCount: null,
            pointsText: s.points === null ? '' : String(s.points),
            pointsMaxText: '',
            isScratched: s.scratched,
          });
          const stations: StationEditDraft[] = w.existing.map((_, i) => {
            const change = w.edits[i];
            const opened_ = stationDrafted(context.faltStations.get(`t${i}`)!);
            if (!change || change.keep) return opened_;
            return { ...opened_, ...asDraft(change.station), deleted: change.deleted };
          });
          for (const row of w.added) {
            stations.push({
              id: null,
              ...(row.blank
                ? {
                    hits: null,
                    figuresHit: 0,
                    figureCount: null,
                    pointsText: '',
                    pointsMaxText: '',
                    isScratched: false,
                  }
                : asDraft(row.station)),
              isShootOff: row.shootOff,
              deleted: false,
            });
          }
          const fields: SessionEditDraft['fields'] = {};
          if (w.target !== undefined) fields.firearmId = w.target;
          const result = buildSessionEdit(
            { sessionId: 'e', fields, series: [], stations, roundsFired: w.typed },
            opened,
            context,
            makeDeps(),
          );
          if (!result.ok) {
            expect(result.errors).toEqual([{ kind: 'nothingToChange' }]);
            return;
          }
          const after = applied(context, changesOf(result));

          // The live stations: the kept ones as drafted, then the new entered ones, by position.
          const live = [...after.faltStations.values()]
            .filter((s) => s.session_id === 'e' && s.deleted_at === null)
            .sort((a, b) => (a.position as number) - (b.position as number));
          const expected = stations.filter(
            (s) => !s.deleted && !(s.id === null && s.hits === null),
          );
          expect(live.map((s) => [s.hits, s.is_scratched, s.points])).toEqual(
            expected.map((s) => [
              s.hits ?? 0,
              s.isScratched ? 1 : 0,
              s.pointsText === '' ? null : Number(s.pointsText),
            ]),
          );
          // Positions unique and increasing; kept rows keep theirs.
          const positions = live.map((s) => s.position as number);
          expect(new Set(positions).size).toBe(positions.length);
          for (const s of live) {
            const was = context.faltStations.get(s.id as string);
            if (was) expect(s.position).toBe(was.position);
          }
          // The phone's shoot-off rule holds over the result: once started, it stays.
          let started = false;
          for (const s of live) {
            if (started) expect(s.is_shoot_off).toBe(1);
            started ||= s.is_shoot_off === 1;
          }

          const sAfter = after.sessions.get('e')!;
          if (w.rounds && w.typed !== undefined) {
            expect(sAfter.extra_rounds).toBe(w.typed === '' ? null : Number(w.typed));
          } else {
            expect(sAfter.extra_rounds).toBe(w.extra);
          }
          expect(after.sessions.get('other')).toBe(context.sessions.get('other'));
          expect(after.faltStations.get('oS')).toBe(context.faltStations.get('oS'));

          const vBefore = oracleRounds(context, 'e');
          const vAfter = oracleRounds(after, 'e');
          const from = w.firearm;
          const to = w.target === undefined ? w.firearm : w.target;
          const moves = new Map<string, number>();
          const move = (id: string | null, d: number) => {
            if (id !== null) moves.set(id, (moves.get(id) ?? 0) + d);
          };
          if (from === to) move(from, vAfter - vBefore);
          else {
            move(from, -vBefore);
            move(to, vAfter);
          }
          for (const id of ['f1', 'f2', 'f3']) {
            const start = context.firearms.get(id)!;
            const d = moves.get(id) ?? 0;
            expect(after.firearms.get(id)!.round_count).toBe(
              Math.max(0, (start.round_count as number) + d),
            );
            if (d === 0) expect(after.firearms.get(id)).toBe(start);
          }
        },
      ),
      { numRuns: 400 },
    );
  });
});
