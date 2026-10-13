// docs/specs/web-session-edit-spec.md §10: the edit page's stations and
// Rounds Fired (U11–U15).
import { buildSessionEdit } from '@shotledger/shared/src/sync-client/session-edit';
import { describe, expect, it } from 'vitest';

import {
  addStation,
  canStartShootOff,
  faltPreview,
  faltSendsTheSame,
  nextStationIsShootOff,
  startShootOff,
  withHits,
  withStation,
  type FaltForm,
} from '../entry/falt-model';
import type { PulledTables } from '../pull';
import { errorMessage, statusMessages } from './messages';
import { editContext, openForm, removeStation, stationPositions, toDraft } from './model';
import { run } from './save';

type Row = Record<string, unknown>;
const OLD = '2026-01-01T00:00:00.000Z';
const NOW = '2026-10-13T10:00:00.000Z';
const common = (id: string) => ({ id, created_at: OLD, updated_at: OLD, deleted_at: null });
const byId = (...rows: Row[]) => new Map(rows.map((row) => [row.id as string, row]));

const session = (id: string, fields: Row = {}): Row => ({
  ...common(id),
  name: `Session ${id}`,
  type: 'training',
  kind: 'series',
  discipline_id: 'spsf-falt',
  program_id: null,
  firearm_id: 'f1',
  ammo_lot_id: null,
  started_at: '2026-05-01T08:30:00.000Z',
  extra_rounds: null,
  ...fields,
});

const station = (id: string, sessionId: string, position: number, fields: Row = {}): Row => ({
  ...common(id),
  session_id: sessionId,
  position,
  hits: 4,
  figures_hit: 3,
  figure_count: null,
  points: null,
  points_max: null,
  is_scratched: 0,
  is_shoot_off: 0,
  photo_uri: null,
  note: null,
  ...fields,
});

/**
 * sF: fält in point-field mode, stations at 4 (out of pull order), 1 (points
 * 7 of 10) and 2; sO: fält ending in a shoot-off; sR: rounds only, 25 rounds;
 * sRF: a rounds-only fält session with no station; sP: precision.
 */
function tables(): PulledTables {
  const empty = () => new Map<string, Row>();
  return {
    sessions: byId(
      session('sF', { falt_result_mode: 'poangfalt' }),
      session('sO'),
      session('sQ'),
      session('sR', { kind: 'rounds', discipline_id: 'spsf-precision', extra_rounds: 25 }),
      session('sRF', { kind: 'rounds' }),
      session('sP', { discipline_id: 'spsf-precision' }),
    ),
    series: empty(),
    shots: empty(),
    falt_stations: byId(
      station('c', 'sF', 4),
      station('a', 'sF', 1, { points: 7, points_max: 10, figure_count: 5 }),
      station('b', 'sF', 2, { is_scratched: 1 }),
      station('o1', 'sO', 1),
      station('o2', 'sO', 2, { is_shoot_off: 1 }),
      // Older data: a plain station after a shoot-off one.
      station('q1', 'sQ', 1, { is_shoot_off: 1 }),
      station('q2', 'sQ', 2),
    ),
    tags: empty(),
    firearms: byId({
      ...common('f1'),
      make: 'Make',
      model: 'M',
      round_count: 100,
      rounds_since_maintenance: 100,
    }),
    firearm_groups: empty(),
    licenses: empty(),
    ammo_lots: empty(),
    session_tags: empty(),
    settings: empty(),
  } as unknown as PulledTables;
}

const opened = (id: string, t = tables()) => openForm(editContext(t), id)!;
const faltOf = (id: string) => opened(id).initial.falt!;
const ids = (falt: FaltForm) => falt.stations.map((row) => row.id ?? null);

describe('the edit page: stations and Rounds Fired', () => {
  it('U11 a fält session opens its live stations by stored position, labelled by it; the result mode is read', () => {
    const form = opened('sF');
    expect(form).toMatchObject({ editsStations: true, editsRounds: false, editsSeries: false });
    const falt = form.initial.falt!;
    expect(falt.resultMode).toBe('poangfalt');
    expect(ids(falt)).toEqual(['a', 'b', 'c']);
    expect(falt.stations[0]).toMatchObject({
      id: 'a',
      position: 1,
      hits: 4,
      figuresHit: 3,
      figureCount: 5,
      pointsText: '7',
      pointsMaxText: '10',
      isScratched: false,
      isShootOff: false,
      deleted: false,
    });
    expect(falt.stations.map((row) => row.isScratched)).toEqual([false, true, false]);
    expect(stationPositions(falt.stations)).toEqual([1, 2, 4]);
    // New rows are labelled after the last stored position.
    expect(stationPositions(addStation(addStation(falt)).stations)).toEqual([1, 2, 4, 5, 6]);
    // A removed station keeps its number taken, as the builder does.
    expect(stationPositions(addStation(removeStation(falt, 2)).stations)).toEqual([1, 2, 4, 5]);
    expect(faltOf('sO').resultMode).toBe('falt');
  });

  it('U11 a rounds-only session opens Rounds Fired; a rounds-only fält session both; others neither', () => {
    expect(opened('sR')).toMatchObject({ editsRounds: true, editsStations: false });
    expect(opened('sR').initial).toMatchObject({ roundsFired: '25', falt: null });
    const both = opened('sRF');
    expect(both).toMatchObject({ editsRounds: true, editsStations: true });
    expect(both.initial).toMatchObject({ roundsFired: '', falt: { stations: [] } });
    expect(opened('sP')).toMatchObject({ editsRounds: false, editsStations: false });
    expect(opened('sP').initial.falt).toBeNull();
  });

  it('U12 Delete Station marks a stored station and Undo brings it back; a new one goes', () => {
    const falt = faltOf('sF');
    const removed = removeStation(falt, 1);
    expect(removed.stations.map((row) => row.deleted)).toEqual([false, true, false]);
    expect(faltPreview(removed).rows).toEqual(['saved', 'removed', 'saved']);
    expect(removeStation(removed, 1).stations.map((row) => row.deleted)).toEqual([
      false,
      false,
      false,
    ]);
    const added = addStation(falt);
    expect(removeStation(added, 3).stations).toHaveLength(3);
  });

  it('U12 a stored shoot-off keeps its flag; the last kept station decides for new rows; Start Shoot-off as the phone offers it', () => {
    const plain = faltOf('sF');
    expect(nextStationIsShootOff(plain)).toBe(false);
    expect(canStartShootOff(plain)).toBe(true);
    const started = startShootOff(plain);
    expect(started.stations).toHaveLength(4);
    expect(started.stations.at(-1)!.id).toBeUndefined();
    expect(started.stations.at(-1)!.isShootOff).toBe(true);
    expect(canStartShootOff(started)).toBe(false);

    const shootOff = faltOf('sO');
    expect(nextStationIsShootOff(shootOff)).toBe(true);
    expect(canStartShootOff(shootOff)).toBe(false);
    expect(addStation(shootOff).stations.at(-1)!.isShootOff).toBe(true);
    // The stored shoot-off removed: the station before it decides, and Start Shoot-off is offered.
    const withoutLast = removeStation(shootOff, 1);
    expect(nextStationIsShootOff(withoutLast)).toBe(false);
    expect(canStartShootOff(withoutLast)).toBe(true);
    // The last stored station decides, whatever came before it; stored flags are never recomputed.
    const older = faltOf('sQ');
    expect(nextStationIsShootOff(older)).toBe(false);
    const draftQ = toDraft('sQ', opened('sQ').initial, {
      ...opened('sQ').initial,
      falt: withHits(addStation(older), 2, 3),
    });
    expect(draftQ.stations!.map((row) => row.isShootOff)).toEqual([true, false, false]);
    // A stored station's flag is never recomputed from the rows before it.
    const toggled = withStation(shootOff, 0, { isShootOff: true });
    expect(
      toDraft('sO', opened('sO').initial, { ...opened('sO').initial, falt: toggled }).stations![1]!
        .isShootOff,
    ).toBe(true);
  });

  it('U12 a stored station offers no unchosen Hits: a row can only be removed, never emptied', () => {
    const falt = withHits(faltOf('sF'), 0, null);
    const form = opened('sF');
    const draft = toDraft('sF', form.initial, { ...form.initial, falt });
    expect(draft.stations![0]).toMatchObject({ id: 'a', hits: null });
    const t = tables();
    const context = editContext(t);
    const result = buildSessionEdit(draft, form.opened, context, {
      newId: () => 'n1',
      newChangeId: () => 'c1',
      now: () => NOW,
    });
    expect(result).toEqual({ ok: false, errors: [{ kind: 'invalidStation', row: 1 }] });
  });

  it('U13 an appended blank station keeps a held request; any other station or removal drops it', () => {
    const falt = faltOf('sF');
    expect(faltSendsTheSame(falt, addStation(falt))).toBe(true);
    expect(faltSendsTheSame(falt, removeStation(falt, 0))).toBe(false);
    expect(faltSendsTheSame(falt, withHits(falt, 1, 5))).toBe(false);
    expect(faltSendsTheSame(falt, withHits(addStation(falt), 3, 2))).toBe(false);
  });

  it('U13 toDraft sends every station row in form order and Rounds Fired only when changed', () => {
    const form = opened('sRF');
    expect(toDraft('sRF', form.initial, form.initial)).toEqual({
      sessionId: 'sRF',
      fields: {},
      series: [],
      stations: [],
    });
    const changed = toDraft('sRF', form.initial, {
      ...form.initial,
      roundsFired: '30',
      falt: withHits(addStation(form.initial.falt!), 0, 5),
    });
    expect(changed.roundsFired).toBe('30');
    expect(changed.stations).toEqual([
      {
        id: null,
        hits: 5,
        figuresHit: 1,
        figureCount: null,
        pointsText: '',
        pointsMaxText: '',
        isScratched: false,
        isShootOff: false,
        deleted: false,
      },
    ]);
    // A session that is not scored in hits sends no stations.
    const p = opened('sP');
    expect(toDraft('sP', p.initial, p.initial)).not.toHaveProperty('stations');
  });

  it('U14 station and rounds errors carry their row or none; nothing is sent', async () => {
    expect(errorMessage({ kind: 'stationPoints', row: 2 })).toEqual({
      key: 'web.entry.errorStationPoints',
      station: 2,
    });
    expect(errorMessage({ kind: 'invalidStation', row: 3 })).toEqual({
      key: 'web.entry.errorInvalidStation',
      station: 3,
    });
    expect(errorMessage({ kind: 'invalidRounds' })).toEqual({
      key: 'session.roundsFiredInvalid',
      params: { max: 10_000 },
    });
    const form = opened('sR');
    const draft = toDraft('sR', form.initial, { ...form.initial, roundsFired: '2.5' });
    let pushed = false;
    const next = await run(
      {
        currentUserId: async () => 'u1',
        loadContext: async () => editContext(tables()),
        build: (fresh) =>
          buildSessionEdit(draft, form.opened, fresh, {
            newId: () => 'n',
            newChangeId: () => 'c',
            now: () => NOW,
          }),
        push: async () => {
          pushed = true;
          return { kind: 'saved' };
        },
        refresh: async () => true,
      },
      'save',
      null,
    );
    expect(next.status).toEqual({ kind: 'invalid', errors: [{ kind: 'invalidRounds' }] });
    expect(pushed).toBe(false);
  });

  it('U15 saved in part after a refused station names the firearm to check (E8)', async () => {
    const form = opened('sF');
    const draft = toDraft('sF', form.initial, {
      ...form.initial,
      falt: removeStation(form.initial.falt!, 0),
    });
    let n = 0;
    const next = await run(
      {
        currentUserId: async () => 'u1',
        loadContext: async () => editContext(tables()),
        build: (fresh) =>
          buildSessionEdit(draft, form.opened, fresh, {
            newId: () => `n${(n += 1)}`,
            newChangeId: () => `c${(n += 1)}`,
            now: () => NOW,
          }),
        push: async () => ({
          kind: 'partlyRejected',
          rejected: [{ tableName: 'falt_stations', rowId: 'a', reason: 'tombstoned' }],
        }),
        refresh: async () => true,
      },
      'save',
      null,
    );
    expect(next.status).toMatchObject({ kind: 'done', refused: 1, firearmsToCheck: ['f1'] });
    expect(statusMessages(next, () => 'Make M').map((m) => m.key)).toEqual([
      'web.entry.saved',
      'web.bulk.refused',
      'web.bulk.checkRoundCounts',
    ]);
  });
});
