import { describe, expect, it } from 'vitest';

import {
  buildAnalyticsSeries,
  buildAnalyticsSessions,
  buildFaltAnalyticsSessions,
  type FaltStationRow,
  type SeriesRow,
  type SessionRow,
} from './rows';

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: 's1',
  type: 'training',
  disciplineId: 'spsf-precision',
  programId: null,
  startedAt: '2026-01-05T00:00:00.000Z',
  weaponGroup: 'spsf:C',
  shooterClass: '2',
  firearmId: null,
  ammoLotId: null,
  extraRounds: null,
  faltResultMode: null,
  ...over,
});

const seriesRow = (over: Partial<SeriesRow> = {}): SeriesRow => ({
  id: 'r1',
  sessionId: 's1',
  position: 1,
  isSighter: 0,
  isFinal: 0,
  isTotalOverride: 0,
  totalOverrideTenths: null,
  totalOverrideShotCount: null,
  ...over,
});

const station = (over: Partial<FaltStationRow> = {}): FaltStationRow => ({
  sessionId: 'f1',
  position: 1,
  hits: 6,
  figuresHit: 3,
  points: null,
  isScratched: 0,
  isShootOff: 0,
  ...over,
});

describe('buildAnalyticsSeries', () => {
  it("joins the session's fields, shots, flags and tags onto each series", () => {
    const [built] = buildAnalyticsSeries({
      sessions: [session()],
      series: [seriesRow({ isSighter: 1 })],
      shots: [
        { seriesId: 'r1', valueTenths: 100, isInnerTen: 1 },
        { seriesId: 'r1', valueTenths: 80, isInnerTen: 0 },
      ],
      sessionTags: [
        { sessionId: 's1', tagId: 't1' },
        { sessionId: 's1', tagId: 't2' },
      ],
    });
    expect(built).toMatchObject({
      id: 'r1',
      sessionId: 's1',
      startedAt: '2026-01-05T00:00:00.000Z',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      isSighter: true,
      isFinal: false,
      shots: [
        { valueTenths: 100, isInnerTen: true },
        { valueTenths: 80, isInnerTen: false },
      ],
      totalOverride: null,
      volumeOnlyShotCount: null,
      sessionType: 'training',
      tagIds: ['t1', 't2'],
    });
  });

  it('drops a series whose session is not among the rows', () => {
    expect(
      buildAnalyticsSeries({
        sessions: [],
        series: [seriesRow()],
        shots: [],
        sessionTags: [],
      }),
    ).toEqual([]);
  });

  it('reads a stored total, and a shot count with no total as volume only', () => {
    const built = buildAnalyticsSeries({
      sessions: [session()],
      series: [
        seriesRow({
          id: 'a',
          isTotalOverride: 1,
          totalOverrideTenths: 450,
          totalOverrideShotCount: 5,
        }),
        seriesRow({ id: 'b', isTotalOverride: 1, totalOverrideShotCount: 5 }),
      ],
      shots: [],
      sessionTags: [],
    });
    expect(built[0]).toMatchObject({
      totalOverride: { tenths: 450, shotCount: 5 },
      volumeOnlyShotCount: null,
    });
    expect(built[1]).toMatchObject({ totalOverride: null, volumeOnlyShotCount: 5 });
  });
});

describe('buildAnalyticsSessions', () => {
  it('lists every session, with its station count, extra rounds and tags', () => {
    const built = buildAnalyticsSessions({
      sessions: [session({ extraRounds: 20 }), session({ id: 'f1', disciplineId: 'spsf-falt' })],
      faltStations: [{ sessionId: 'f1' }, { sessionId: 'f1' }],
      sessionTags: [{ sessionId: 's1', tagId: 't1' }],
    });
    expect(built).toEqual([
      expect.objectContaining({
        id: 's1',
        extraRounds: 20,
        stationCount: 0,
        tagIds: ['t1'],
        scoresHits: false,
      }),
      expect.objectContaining({
        id: 'f1',
        extraRounds: 0,
        stationCount: 2,
        tagIds: [],
        scoresHits: true,
      }),
    ]);
  });
});

describe('buildFaltAnalyticsSessions', () => {
  it('keeps hits disciplines only, with stations in position order', () => {
    const built = buildFaltAnalyticsSessions({
      sessions: [
        session(),
        session({ id: 'f1', disciplineId: 'spsf-falt', faltResultMode: 'falt' }),
      ],
      faltStations: [
        station({ position: 2, hits: 4, isScratched: 1 }),
        station({ position: 1, hits: 6, points: 9, isShootOff: 1 }),
      ],
      sessionTags: [],
    });
    expect(built).toEqual([
      expect.objectContaining({
        id: 'f1',
        resultMode: 'falt',
        stations: [
          { hits: 6, figuresHit: 3, points: 9, isScratched: false, isShootOff: true },
          { hits: 4, figuresHit: 3, points: null, isScratched: true, isShootOff: false },
        ],
      }),
    ]);
  });

  it('is empty when no session scores hits', () => {
    expect(
      buildFaltAnalyticsSessions({
        sessions: [session()],
        faltStations: [station()],
        sessionTags: [],
      }),
    ).toEqual([]);
  });
});
