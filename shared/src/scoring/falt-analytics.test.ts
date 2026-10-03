// docs/specs/falt-consumers-spec.md, Layer B: R1–R5 and PB1–PB4.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ANY_ANALYTICS_FILTER, type AnalyticsFilter } from './analytics';
import { type FaltStationEntry } from './falt';
import {
  faltPbCoverage,
  faltPbGroupKey,
  faltPersonalBests,
  faltReportTotals,
  faltSessionPoints,
  filterFaltSessions,
  parseFaltPbGroupKey,
  type FaltAnalyticsSession,
} from './falt-analytics';

function station(hits: number, figuresHit: number, extra: Partial<FaltStationEntry> = {}) {
  return { hits, figuresHit, points: null, isScratched: false, isShootOff: false, ...extra };
}

function session(overrides: Partial<FaltAnalyticsSession> = {}): FaltAnalyticsSession {
  return {
    id: 's1',
    startedAt: '2026-05-01T09:00:00.000Z',
    sessionType: 'competition',
    disciplineId: 'spsf-falt',
    weaponGroup: 'spsf:C',
    resultMode: 'falt',
    tagIds: [],
    stations: [station(5, 3), station(6, 4)],
    ...overrides,
  };
}

function filter(overrides: Partial<AnalyticsFilter> = {}): AnalyticsFilter {
  return { ...ANY_ANALYTICS_FILTER, ...overrides };
}

describe('faltReportTotals', () => {
  it('R1: counts sessions, scoring stations, hits and figures, and the hit rate', () => {
    const totals = faltReportTotals([
      session({ id: 'a', stations: [station(5, 3), station(6, 4)] }),
      session({ id: 'b', stations: [station(3, 2)] }),
    ]);
    expect(totals).toEqual({
      sessionCount: 2,
      stationCount: 3,
      hits: 14,
      figuresHit: 9,
      hitRate: 14 / 18,
    });
  });

  it('R2: a scratched or särskjutning station adds nothing', () => {
    const totals = faltReportTotals([
      session({
        stations: [
          station(5, 3),
          station(6, 0, { isScratched: true }),
          station(4, 2, { isShootOff: true }),
        ],
      }),
    ]);
    expect(totals).toEqual({
      sessionCount: 1,
      stationCount: 1,
      hits: 5,
      figuresHit: 3,
      hitRate: 5 / 6,
    });
  });

  it('R1: no scoring station gives a null hit rate, not NaN', () => {
    expect(faltReportTotals([])).toEqual({
      sessionCount: 0,
      stationCount: 0,
      hits: 0,
      figuresHit: 0,
      hitRate: null,
    });
    expect(
      faltReportTotals([session({ stations: [station(6, 0, { isScratched: true })] })]).hitRate,
    ).toBeNull();
  });
});

describe('faltSessionPoints', () => {
  it('R3: one point per session with a scoring station, by date then id', () => {
    const points = faltSessionPoints([
      session({ id: 'late', startedAt: '2026-06-01T00:00:00.000Z', stations: [station(6, 4)] }),
      session({ id: 'b', startedAt: '2026-05-01T00:00:00.000Z', stations: [station(3, 2)] }),
      session({ id: 'a', startedAt: '2026-05-01T00:00:00.000Z', stations: [station(4, 2)] }),
      session({ id: 'empty', stations: [station(6, 0, { isScratched: true })] }),
    ]);
    expect(points).toEqual([
      {
        sessionId: 'a',
        startedAt: '2026-05-01T00:00:00.000Z',
        disciplineId: 'spsf-falt',
        hitsPerStation: 4,
      },
      {
        sessionId: 'b',
        startedAt: '2026-05-01T00:00:00.000Z',
        disciplineId: 'spsf-falt',
        hitsPerStation: 3,
      },
      {
        sessionId: 'late',
        startedAt: '2026-06-01T00:00:00.000Z',
        disciplineId: 'spsf-falt',
        hitsPerStation: 6,
      },
    ]);
  });

  it('R3: hits per station is over the scoring stations only', () => {
    const [point] = faltSessionPoints([
      session({ stations: [station(5, 3), station(1, 1, { isShootOff: true }), station(3, 2)] }),
    ]);
    expect(point?.hitsPerStation).toBe(4);
  });
});

describe('filterFaltSessions', () => {
  it('R4: the date, type, discipline and tag filter apply as to any session', () => {
    const list = [
      session({ id: 'in', startedAt: '2026-05-01T00:00:00.000Z', tagIds: ['t'] }),
      session({ id: 'early', startedAt: '2026-01-01T00:00:00.000Z', tagIds: ['t'] }),
      session({ id: 'training', sessionType: 'training', tagIds: ['t'] }),
      session({ id: 'untagged' }),
      session({ id: 'other', disciplineId: 'spsf-magnumfalt', tagIds: ['t'] }),
    ];
    const kept = filterFaltSessions(
      list,
      filter({
        fromIso: '2026-04-01T00:00:00.000Z',
        sessionType: 'competition',
        disciplineId: 'spsf-falt',
        tagIds: ['t'],
      }),
    );
    expect(kept.map((s) => s.id)).toEqual(['in']);
  });

  it('R5: a shots-per-series filter excludes every fält session', () => {
    expect(filterFaltSessions([session()], filter({ shotsPerSeries: 5 }))).toEqual([]);
    expect(filterFaltSessions([session()], filter({ shotsPerSeries: 6 }))).toEqual([]);
    expect(filterFaltSessions([session()], filter())).toHaveLength(1);
  });
});

describe('faltPbGroupKey / parseFaltPbGroupKey', () => {
  it('round-trips a group, including a vapengrupp id that contains a colon', () => {
    const group = {
      disciplineId: 'spsf-falt',
      weaponGroupId: 'spsf:A-opt',
      mode: 'poangfalt' as const,
      stationCount: 8,
    };
    expect(parseFaltPbGroupKey(faltPbGroupKey(group))).toEqual(group);
    const ungrouped = { ...group, weaponGroupId: null };
    expect(parseFaltPbGroupKey(faltPbGroupKey(ungrouped))).toEqual(ungrouped);
  });

  it('round-trips any group (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          disciplineId: fc.stringMatching(/^[a-z][a-z-]{0,15}$/),
          weaponGroupId: fc.option(fc.stringMatching(/^[a-z]+:[A-Za-z-]{1,6}$/), { nil: null }),
          mode: fc.constantFrom('falt' as const, 'poangfalt' as const),
          stationCount: fc.integer({ min: 1, max: 20 }),
        }),
        (group) => {
          expect(parseFaltPbGroupKey(faltPbGroupKey(group))).toEqual(group);
        },
      ),
    );
  });
});

describe('faltPersonalBests', () => {
  const key = (
    stationCount: number,
    mode: 'falt' | 'poangfalt' = 'falt',
    weaponGroupId = 'spsf:C',
  ) => faltPbGroupKey({ disciplineId: 'spsf-falt', weaponGroupId, mode, stationCount });

  it('PB1: keeps the best round per group by SHB’s order in that mode', () => {
    const pbs = faltPersonalBests([
      session({ id: 'fewer-hits', stations: [station(5, 4), station(5, 4)] }),
      session({ id: 'best', stations: [station(6, 3), station(5, 3)] }),
      session({
        id: 'other-group',
        weaponGroup: 'spsf:B',
        stations: [station(1, 1), station(1, 1)],
      }),
    ]);
    expect(pbs.get(key(2))?.sessionId).toBe('best');
    expect(pbs.get(key(2))?.result).toEqual({
      stationCount: 2,
      hits: 11,
      figuresHit: 6,
      ringedFigurePoints: null,
    });
    expect(pbs.get(key(2, 'falt', 'spsf:B'))?.sessionId).toBe('other-group');
    expect(pbs.size).toBe(2);
  });

  it('PB1: poängfält is ranked apart, by its own sum', () => {
    // Vanlig fält ranks 6/2 ahead of 5/5 on hits; poängfält ranks 5/5 (10) ahead of 6/2 (8).
    const pbs = faltPersonalBests([
      session({ id: 'more-hits', resultMode: 'poangfalt', stations: [station(6, 2)] }),
      session({ id: 'more-points', resultMode: 'poangfalt', stations: [station(5, 5)] }),
      session({ id: 'vanlig', resultMode: 'falt', stations: [station(1, 1)] }),
    ]);
    expect(pbs.get(key(1, 'poangfalt'))?.sessionId).toBe('more-points');
    expect(pbs.get(key(1, 'falt'))?.sessionId).toBe('vanlig');
  });

  it('PB1: a session with no result mode is ranked as vanlig fält', () => {
    const pbs = faltPersonalBests([session({ id: 'unset', resultMode: null })]);
    expect(pbs.get(key(2, 'falt'))?.sessionId).toBe('unset');
  });

  it('PB1: an ungrouped session gets its own group', () => {
    const pbs = faltPersonalBests([session({ id: 'none', weaponGroup: null })]);
    expect([...pbs.keys()]).toEqual([
      faltPbGroupKey({
        disciplineId: 'spsf-falt',
        weaponGroupId: null,
        mode: 'falt',
        stationCount: 2,
      }),
    ]);
  });

  it('PB2: of two rounds SHB cannot separate, the earlier stands', () => {
    const pbs = faltPersonalBests([
      session({ id: 'first', startedAt: '2026-03-01T00:00:00.000Z' }),
      session({ id: 'second', startedAt: '2026-04-01T00:00:00.000Z' }),
    ]);
    expect(pbs.get(key(2))?.sessionId).toBe('first');
    expect(pbs.get(key(2))?.startedAt).toBe('2026-03-01T00:00:00.000Z');

    const reversed = faltPersonalBests([
      session({ id: 'second', startedAt: '2026-04-01T00:00:00.000Z' }),
      session({ id: 'first', startedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(reversed.get(key(2))?.sessionId).toBe('first');
  });

  it('PB3: a session with no scoring station has no group', () => {
    const pbs = faltPersonalBests([
      session({
        stations: [station(6, 0, { isScratched: true }), station(3, 2, { isShootOff: true })],
      }),
      session({ id: 'empty', stations: [] }),
    ]);
    expect(pbs.size).toBe(0);
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_007
 */
it('PB4: a ten-station round with two scratched competes with eight-station rounds', () => {
  const eight = Array.from({ length: 8 }, () => station(5, 3));
  const championship = [
    ...Array.from({ length: 8 }, () => station(6, 4)),
    station(6, 0, { isScratched: true }),
    station(0, 0, { isScratched: true }),
  ];
  const pbs = faltPersonalBests([
    session({ id: 'kretsfalt', stations: eight }),
    session({ id: 'sm', stations: championship }),
  ]);
  const group = faltPbGroupKey({
    disciplineId: 'spsf-falt',
    weaponGroupId: 'spsf:C',
    mode: 'falt',
    stationCount: 8,
  });
  expect([...pbs.keys()]).toEqual([group]);
  expect(pbs.get(group)?.sessionId).toBe('sm');
});

describe('faltPbCoverage', () => {
  it('PB5: counts the sessions that reached a group, and the ungrouped among them', () => {
    const coverage = faltPbCoverage(
      [
        session({ id: 'a' }),
        session({ id: 'b', weaponGroup: 'spsf:B' }),
        session({ id: 'ungrouped', weaponGroup: null }),
        session({ id: 'scratched', stations: [station(6, 0, { isScratched: true })] }),
      ],
      40,
    );
    expect(coverage).toEqual({ considered: 40, counted: 3, ungrouped: 1 });
  });
});
