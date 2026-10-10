// docs/specs/web-falt-entry-spec.md FE1–FE12.
import { describe, expect, it } from 'vitest';

import { TEXT_LIMITS } from '../sync/text-limits';
import {
  ClientChangeSchema,
  MAX_PAYLOAD_BYTES,
  PUSH_BATCH_MAX,
  PushRequestSchema,
  type ClientChange,
} from '../sync/protocol';
import {
  buildFaltEntry,
  newStationRow,
  type FaltEntryDraft,
  type FaltEntryResult,
  type StationDraft,
} from './falt-entry';
import { applyRank } from './order';
import type { Payload } from './rows';
import type { EntryContext } from './session-entry';

const NOW = '2026-10-07T10:00:00.000Z';

function makeDeps() {
  let ids = 0;
  let changeIds = 0;
  const hex = (n: number) => n.toString(16).padStart(12, '0');
  return {
    newId: () => `0199b000-0000-7000-8000-${hex((ids += 1))}`,
    newChangeId: () => `00000000-0000-4000-8000-${hex((changeIds += 1))}`,
    now: () => NOW,
  };
}

const station = (patch: Partial<StationDraft> = {}): StationDraft => ({
  hits: 0,
  figuresHit: 0,
  figureCount: null,
  pointsText: '',
  pointsMaxText: '',
  isScratched: false,
  isShootOff: false,
  ...patch,
});

const draft = (overrides: Partial<FaltEntryDraft> = {}): FaltEntryDraft => ({
  type: 'training',
  disciplineId: 'spsf-falt',
  startedAt: '2026-10-06T16:00:00.000Z',
  name: '',
  defaultName: 'Training — 6 Oct 2026',
  location: '',
  competitionLevel: null,
  isChampionship: false,
  competitionName: '',
  weaponGroup: null,
  shooterClass: null,
  eventId: null,
  firearmId: null,
  ammoLotId: null,
  faltResultMode: 'falt',
  stations: [
    station({ hits: 6, figuresHit: 3 }),
    station({ hits: 4, figuresHit: 2, figureCount: 3 }),
    station({ hits: 5, figuresHit: 4, pointsText: '12', pointsMaxText: '20' }),
  ],
  ...overrides,
});

const firearm = (id: string, roundCount = 100): Payload => ({
  id,
  make: 'Make',
  model: 'Model',
  round_count: roundCount,
  rounds_since_maintenance: 4,
  updated_at: '2026-01-01T00:00:00.000Z',
});

const group = (firearmId: string, groupId: string, isDefault = 0): Payload => ({
  id: `${firearmId}-${groupId}`,
  firearm_id: firearmId,
  group_id: groupId,
  is_default_for_group: isDefault,
});

const context = (overrides: Partial<EntryContext> = {}): EntryContext => ({
  firearms: new Map([['f1', firearm('f1')]]),
  firearmGroups: [],
  ammoLots: new Map([['a1', { id: 'a1' }]]),
  ...overrides,
});

function build(d: FaltEntryDraft, c: EntryContext = context()) {
  return buildFaltEntry(d, c, makeDeps());
}

function changesOf(result: FaltEntryResult): ClientChange[] {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.changes;
}

const payloads = (changes: ClientChange[], table: string) =>
  changes.filter((c) => c.tableName === table).map((c) => c.payload as Payload);
const session = (changes: ClientChange[]) => payloads(changes, 'sessions')[0]!;
const stations = (changes: ClientChange[]) => payloads(changes, 'falt_stations');

describe('newStationRow', () => {
  it('FE4 a station row carries every column with addStation’s values', () => {
    expect(
      newStationRow('st1', NOW, {
        sessionId: 's1',
        position: 2,
        hits: 5,
        figuresHit: 4,
        figureCount: null,
        points: null,
        pointsMax: null,
        isScratched: false,
        isShootOff: false,
      }),
    ).toEqual({
      id: 'st1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      session_id: 's1',
      position: 2,
      hits: 5,
      figures_hit: 4,
      figure_count: null,
      points: null,
      points_max: null,
      is_scratched: 0,
      is_shoot_off: 0,
      photo_uri: null,
      note: null,
    });
    expect(
      newStationRow('st2', NOW, {
        sessionId: 's1',
        position: 1,
        hits: 6,
        figuresHit: 3,
        figureCount: 4,
        points: 12,
        pointsMax: 20,
        isScratched: true,
        isShootOff: true,
      }),
    ).toMatchObject({
      figure_count: 4,
      points: 12,
      points_max: 20,
      is_scratched: 1,
      is_shoot_off: 1,
    });
  });
});

describe('buildFaltEntry', () => {
  it('FE1 a training fält entry: firearm +18, session, 3 stations, in APPLY_ORDER', () => {
    const result = build(draft({ firearmId: 'f1', location: ' Range ' }));
    const changes = changesOf(result);
    expect(changes.map((c) => c.tableName)).toEqual([
      'firearms',
      'sessions',
      'falt_stations',
      'falt_stations',
      'falt_stations',
    ]);
    const ranks = changes.map((c) => applyRank(c.tableName));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

    expect(payloads(changes, 'firearms')[0]).toMatchObject({
      id: 'f1',
      make: 'Make',
      round_count: 118,
      rounds_since_maintenance: 22,
      updated_at: NOW,
    });
    const s = session(changes);
    expect(result.ok && result.sessionId).toBe(s.id);
    expect(s).toMatchObject({
      name: 'Training — 6 Oct 2026',
      type: 'training',
      kind: 'series',
      series_entry_mode: 'ask',
      discipline_id: 'spsf-falt',
      program_id: null,
      decimal_scoring: 0,
      series_length: null,
      falt_result_mode: 'falt',
      extra_rounds: null,
      firearm_id: 'f1',
      location: 'Range',
      started_at: '2026-10-06T16:00:00.000Z',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
    });
    expect(stations(changes).map((r) => [r.session_id, r.position, r.hits, r.figures_hit])).toEqual(
      [
        [s.id, 1, 6, 3],
        [s.id, 2, 4, 2],
        [s.id, 3, 5, 4],
      ],
    );
    expect(stations(changes)[1]).toMatchObject({ figure_count: 3, points: null });
    expect(stations(changes)[2]).toMatchObject({ points: 12, points_max: 20 });
    // No series or shots on a fält session.
    expect(changes.some((c) => c.tableName === 'series' || c.tableName === 'shots')).toBe(false);
  });

  it('FE2 the chosen result mode is stored', () => {
    expect(session(changesOf(build(draft({ faltResultMode: 'poangfalt' }))))).toMatchObject({
      falt_result_mode: 'poangfalt',
    });
  });

  it('FE3 blank stations are dropped and positions stay contiguous; a 0-hit station with a figure count and a blank scratched one are kept', () => {
    const changes = changesOf(
      build(
        draft({
          stations: [
            station(),
            station({ hits: 6, figuresHit: 2 }),
            station(),
            station({ figureCount: 4 }),
            station({ isScratched: true }),
            station({ isShootOff: true }),
            station({ pointsText: '0' }),
            station(),
          ],
        }),
      ),
    );
    expect(
      stations(changes).map((r) => [
        r.position,
        r.hits,
        r.figure_count,
        r.is_scratched,
        r.is_shoot_off,
        r.points,
      ]),
    ).toEqual([
      [1, 6, null, 0, 0, null],
      [2, 0, 4, 0, 0, null],
      [3, 0, null, 1, 0, null],
      [4, 0, null, 0, 1, null],
      [5, 0, null, 0, 0, 0],
    ]);
  });

  it('FE4 the max is dropped when no points were entered', () => {
    const changes = changesOf(
      build(draft({ stations: [station({ hits: 1, figuresHit: 1, pointsMaxText: '20' })] })),
    );
    expect(stations(changes)[0]).toMatchObject({ points: null, points_max: null });
  });

  it('FE5 points that do not parse, or exceed the max, are refused; nothing built', () => {
    expect(
      build(
        draft({
          stations: [
            station({ hits: 1, figuresHit: 1, pointsText: 'x' }),
            station({ hits: 1, figuresHit: 1 }),
            station({ hits: 1, figuresHit: 1, pointsText: '12', pointsMaxText: '10' }),
            // A blank-looking row with a bad max is still refused, as the phone refuses it.
            station({ pointsMaxText: 'x' }),
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { kind: 'stationPoints', row: 1 },
        { kind: 'stationPoints', row: 3 },
        { kind: 'stationPoints', row: 4 },
      ],
    });
  });

  it('FE6 an impossible scoring station is refused; a scratched one is kept', () => {
    expect(
      build(
        draft({
          stations: [
            station({ hits: 7, figuresHit: 1 }),
            station({ hits: 3, figuresHit: 0 }),
            station({ hits: 3, figuresHit: 4 }),
            station({ hits: 4, figuresHit: 3, figureCount: 2 }),
            station({ hits: 6, figuresHit: 3 }),
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { kind: 'invalidStation', row: 1 },
        { kind: 'invalidStation', row: 2 },
        { kind: 'invalidStation', row: 3 },
        { kind: 'invalidStation', row: 4 },
      ],
    });
    const kept = changesOf(
      build(draft({ stations: [station({ hits: 7, figuresHit: 9, isScratched: true })] })),
    );
    expect(stations(kept)[0]).toMatchObject({ hits: 7, figures_hit: 9, is_scratched: 1 });
  });

  it('FE7 the firearm moves six per saved station, scratched and shoot-off included', () => {
    const changes = changesOf(
      build(
        draft({
          firearmId: 'f1',
          stations: [
            station({ hits: 6, figuresHit: 3 }),
            station({ isScratched: true }),
            station({ hits: 2, figuresHit: 1, isShootOff: true }),
            station(),
          ],
        }),
      ),
    );
    expect(payloads(changes, 'firearms')[0]).toMatchObject({
      round_count: 118,
      rounds_since_maintenance: 22,
    });

    const noFirearm = changesOf(build(draft()));
    expect(payloads(noFirearm, 'firearms')).toEqual([]);
    const noStation = changesOf(build(draft({ firearmId: 'f1', stations: [station()] })));
    expect(payloads(noStation, 'firearms')).toEqual([]);
    expect(session(noStation).firearm_id).toBe('f1');
  });

  it('FE8 competition fields are kept, training nulls them and takes the vapengrupp from the gun', () => {
    const fields = {
      competitionLevel: 'krets',
      isChampionship: true,
      competitionName: '  KM  ',
      shooterClass: '2',
      eventId: 'some-event',
      weaponGroup: 'spsf:B',
      firearmId: 'f1',
    };
    const groups = [group('f1', 'spsf:C'), group('f2', 'spsf:A')];

    expect(
      session(changesOf(build(draft(fields), context({ firearmGroups: groups })))),
    ).toMatchObject({
      type: 'training',
      competition_level: null,
      is_championship: 0,
      competition_name: null,
      shooter_class: null,
      event_id: null,
      weapon_group: 'spsf:C',
    });
    expect(
      session(
        changesOf(build(draft({ ...fields, type: 'competition', name: ' Fält-KM ' }), context())),
      ),
    ).toMatchObject({
      type: 'competition',
      name: 'Fält-KM',
      competition_level: 'krets',
      is_championship: 1,
      competition_name: 'KM',
      shooter_class: '2',
      event_id: 'some-event',
      weapon_group: 'spsf:B',
    });
  });

  it('FE9 the session-field errors are the series builder’s, collected with station errors', () => {
    expect(
      build(
        draft({
          name: 'n'.repeat(TEXT_LIMITS.sessions.name + 1),
          location: 'l'.repeat(TEXT_LIMITS.sessions.location + 1),
          type: 'competition',
          competitionName: 'c'.repeat(TEXT_LIMITS.sessions.competition_name + 1),
          firearmId: 'f9',
          ammoLotId: 'a9',
          startedAt: '2026-10-06',
          stations: [station({ hits: 1, figuresHit: 1, pointsText: 'x' })],
        }),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { kind: 'tooLong', field: 'name', max: TEXT_LIMITS.sessions.name },
        {
          kind: 'tooLong',
          field: 'competitionName',
          max: TEXT_LIMITS.sessions.competition_name,
        },
        { kind: 'tooLong', field: 'location', max: TEXT_LIMITS.sessions.location },
        { kind: 'stationPoints', row: 1 },
        { kind: 'unknownFirearm' },
        { kind: 'unknownAmmoLot' },
        { kind: 'invalidStartedAt' },
      ],
    });
    // Within the limits, and a known ammo lot, builds.
    const ok = changesOf(
      build(
        draft({
          name: 'n'.repeat(TEXT_LIMITS.sessions.name),
          location: 'l'.repeat(TEXT_LIMITS.sessions.location),
          ammoLotId: 'a1',
        }),
      ),
    );
    expect(session(ok)).toMatchObject({ ammo_lot_id: 'a1' });
  });

  it('FE10 a ring discipline throws RangeError', () => {
    expect(() => build(draft({ disciplineId: 'spsf-precision' }))).toThrow(RangeError);
    expect(() => build(draft({ disciplineId: 'spsf-precision' }))).toThrow(
      'spsf-precision is not scored in hits',
    );
  });

  it('FE11 every change parses, ids are fresh, rowId = payload.id, within push limits', () => {
    const changes = changesOf(
      build(
        draft({
          type: 'competition',
          name: '€'.repeat(TEXT_LIMITS.sessions.name),
          competitionName: '€'.repeat(TEXT_LIMITS.sessions.competition_name),
          location: '€'.repeat(TEXT_LIMITS.sessions.location),
          firearmId: 'f1',
          ammoLotId: 'a1',
        }),
      ),
    );
    expect(PushRequestSchema.safeParse({ protocolVersion: 1, changes }).success).toBe(true);
    const encoder = new TextEncoder();
    for (const change of changes) {
      expect(ClientChangeSchema.safeParse(change).success).toBe(true);
      const payload = change.payload as Payload;
      expect(change.rowId).toBe(payload.id);
      expect(change).toMatchObject({ deletedAt: null, updatedAt: NOW });
      expect(encoder.encode(JSON.stringify(payload)).length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    }
    expect(new Set(changes.map((c) => c.clientChangeId)).size).toBe(changes.length);
    expect(new Set(changes.map((c) => c.rowId)).size).toBe(changes.length);
  });

  it('FE11 more than PUSH_BATCH_MAX changes is refused', () => {
    const many = (n: number) =>
      draft({
        firearmId: 'f1',
        stations: Array.from({ length: n }, () => station({ hits: 1, figuresHit: 1 })),
      });
    // firearm + session + 498 stations = exactly PUSH_BATCH_MAX.
    expect(changesOf(build(many(PUSH_BATCH_MAX - 2)))).toHaveLength(PUSH_BATCH_MAX);
    expect(build(many(PUSH_BATCH_MAX - 1))).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX }],
    });
  });

  it('FE12 no station at all saves the session alone', () => {
    const changes = changesOf(build(draft({ stations: [] })));
    expect(changes.map((c) => c.tableName)).toEqual(['sessions']);
  });
});
