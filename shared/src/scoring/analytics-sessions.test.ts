// Spec: docs/specs/analytics-session-set-spec.md. Each `FS-n` / `RS-n` /
// `RT-n` tag in a test name is the acceptance criterion it asserts.
import { describe, expect, it } from 'vitest';

import {
  analyticsReportSessions,
  analyticsReportSet,
  analyticsReportTotals,
  analyticsTotals,
  ANY_ANALYTICS_FILTER,
  filterAnalyticsSessions,
  type AnalyticsFilter,
  type AnalyticsSeries,
  type AnalyticsSession,
} from './analytics';

let seq = 0;

type SeriesOverrides = Partial<AnalyticsSeries> & { values?: readonly number[] };

function series({ values, ...overrides }: SeriesOverrides = {}): AnalyticsSeries {
  seq += 1;
  return {
    id: `s${seq}`,
    sessionId: 'session-1',
    startedAt: '2026-05-01T10:00:00.000Z',
    disciplineId: 'spsf-precision',
    isSighter: false,
    isFinal: false,
    sessionType: 'training',
    tagIds: [],
    shots: (values ?? []).map((valueTenths) => ({ valueTenths, isInnerTen: false })),
    ...overrides,
  };
}

function session(overrides: Partial<AnalyticsSession> = {}): AnalyticsSession {
  return {
    id: 'session-1',
    startedAt: '2026-05-01T10:00:00.000Z',
    sessionType: 'training',
    disciplineId: 'spsf-precision',
    tagIds: [],
    extraRounds: 0,
    stationCount: 0,
    seriesLength: 5,
    scoresHits: false,
    ...overrides,
  };
}

function filter(overrides: Partial<AnalyticsFilter> = {}): AnalyticsFilter {
  return { ...ANY_ANALYTICS_FILTER, ...overrides };
}

const ids = (list: readonly AnalyticsSession[]) => list.map((s) => s.id);

describe('filterAnalyticsSessions', () => {
  it('FS-1: an unset filter keeps every session', () => {
    const list = [session({ id: 'a' }), session({ id: 'b', sessionType: 'competition' })];
    expect(ids(filterAnalyticsSessions(list, ANY_ANALYTICS_FILTER))).toEqual(['a', 'b']);
  });

  it('FS-2: the date bounds are inclusive', () => {
    const list = [
      session({ id: 'early', startedAt: '2026-01-01T00:00:00.000Z' }),
      session({ id: 'edge', startedAt: '2026-06-01T00:00:00.000Z' }),
      session({ id: 'late', startedAt: '2026-12-01T00:00:00.000Z' }),
    ];
    expect(
      ids(filterAnalyticsSessions(list, filter({ fromIso: '2026-06-01T00:00:00.000Z' }))),
    ).toEqual(['edge', 'late']);
    expect(
      ids(filterAnalyticsSessions(list, filter({ toIso: '2026-06-01T00:00:00.000Z' }))),
    ).toEqual(['early', 'edge']);
  });

  it('FS-3: sessionType keeps only that type', () => {
    const list = [
      session({ id: 'training' }),
      session({ id: 'competition', sessionType: 'competition' }),
    ];
    expect(ids(filterAnalyticsSessions(list, filter({ sessionType: 'competition' })))).toEqual([
      'competition',
    ]);
    expect(ids(filterAnalyticsSessions(list, filter({ sessionType: 'training' })))).toEqual([
      'training',
    ]);
  });

  it('FS-4: disciplineId keeps only that discipline', () => {
    const list = [
      session({ id: 'precision' }),
      session({ id: 'milsnabb', disciplineId: 'spsf-milsnabb' }),
    ];
    expect(ids(filterAnalyticsSessions(list, filter({ disciplineId: 'spsf-milsnabb' })))).toEqual([
      'milsnabb',
    ]);
  });

  it('FS-5: tagIds is an OR-match, and an empty list is no filter', () => {
    const list = [
      session({ id: 'km', tagIds: ['t-km'] }),
      session({ id: 'training', tagIds: ['t-training'] }),
      session({ id: 'untagged' }),
    ];
    expect(ids(filterAnalyticsSessions(list, filter({ tagIds: ['t-km'] })))).toEqual(['km']);
    expect(ids(filterAnalyticsSessions(list, filter({ tagIds: ['t-km', 't-training'] })))).toEqual([
      'km',
      'training',
    ]);
    expect(filterAnalyticsSessions(list, filter({ tagIds: [] }))).toHaveLength(3);
    expect(filterAnalyticsSessions(list, filter({ tagIds: ['t-none'] }))).toEqual([]);
  });

  it('FS-6: shotsPerSeries is ignored — it is a question about series', () => {
    const list = [session({ id: 'a' }), session({ id: 'b' })];
    expect(ids(filterAnalyticsSessions(list, filter({ shotsPerSeries: 5 })))).toEqual(['a', 'b']);
  });

  it('FS-7: predicates compose with AND', () => {
    const list = [
      session({ id: 'both', sessionType: 'competition', tagIds: ['t-km'] }),
      session({ id: 'type-only', sessionType: 'competition' }),
      session({ id: 'tag-only', tagIds: ['t-km'] }),
    ];
    expect(
      ids(filterAnalyticsSessions(list, filter({ sessionType: 'competition', tagIds: ['t-km'] }))),
    ).toEqual(['both']);
  });
});

describe('analyticsReportSessions', () => {
  it('RS-1: a session with at least one matching series is included', () => {
    const all = [series({ sessionId: 'a' })];
    expect(
      ids(analyticsReportSessions([session({ id: 'a' })], all, all, ANY_ANALYTICS_FILTER)),
    ).toEqual(['a']);
  });

  it('RS-2: a series-free session matching the filter is included (266 vs 267)', () => {
    const withSeries = [series({ sessionId: 'a' })];
    const sessions = [session({ id: 'a' }), session({ id: 'rounds-only' })];
    expect(
      ids(analyticsReportSessions(sessions, withSeries, withSeries, ANY_ANALYTICS_FILTER)),
    ).toEqual(['a', 'rounds-only']);
  });

  it('RS-3: a series-free session failing the session-level filter is excluded', () => {
    const withSeries = [series({ sessionId: 'a' })];
    const sessions = [
      session({ id: 'a' }),
      session({ id: 'rounds-only', sessionType: 'competition' }),
    ];
    expect(
      ids(
        analyticsReportSessions(
          sessions,
          withSeries,
          withSeries,
          filter({ sessionType: 'training' }),
        ),
      ),
    ).toEqual(['a']);
  });

  it('RS-4: a session whose only series are excluded by shotsPerSeries is excluded', () => {
    const all = [series({ sessionId: 'a', values: [90, 90, 90] })];
    const matched: AnalyticsSeries[] = [];
    expect(
      ids(
        analyticsReportSessions(
          [session({ id: 'a' })],
          all,
          matched,
          filter({ shotsPerSeries: 5 }),
        ),
      ),
    ).toEqual([]);
  });

  it('RS-5: shotsPerSeries does not exclude a session that has no series at all', () => {
    const all = [series({ sessionId: 'a', values: [90, 90, 90] })];
    const matched: AnalyticsSeries[] = [];
    const sessions = [session({ id: 'a' }), session({ id: 'rounds-only' })];
    expect(
      ids(analyticsReportSessions(sessions, all, matched, filter({ shotsPerSeries: 5 }))),
    ).toEqual(['rounds-only']);
  });

  it('R5: shotsPerSeries excludes a fält session, which has stations rather than series', () => {
    const sessions = [
      session({ id: 'rounds-only' }),
      session({ id: 'falt', disciplineId: 'spsf-falt', stationCount: 2, scoresHits: true }),
    ];
    expect(ids(analyticsReportSessions(sessions, [], [], filter({ shotsPerSeries: 6 })))).toEqual([
      'rounds-only',
    ]);
    expect(ids(analyticsReportSessions(sessions, [], [], ANY_ANALYTICS_FILTER))).toEqual([
      'falt',
      'rounds-only',
    ]);
  });

  it('RS-6: a matched series whose session is unknown is dropped, not invented', () => {
    const all = [series({ sessionId: 'ghost' })];
    expect(analyticsReportSessions([], all, all, ANY_ANALYTICS_FILTER)).toEqual([]);
  });

  it('RS-7: sorted by startedAt then id, with no duplicates', () => {
    const all = [
      series({ sessionId: 'b' }),
      series({ sessionId: 'b' }),
      series({ sessionId: 'a' }),
    ];
    const sessions = [
      session({ id: 'b', startedAt: '2026-05-01T10:00:00.000Z' }),
      session({ id: 'a', startedAt: '2026-05-01T10:00:00.000Z' }),
      session({ id: 'earlier', startedAt: '2026-01-01T10:00:00.000Z' }),
    ];
    expect(ids(analyticsReportSessions(sessions, all, all, ANY_ANALYTICS_FILTER))).toEqual([
      'earlier',
      'a',
      'b',
    ]);
  });

  it('RS-8: an empty session list yields an empty result', () => {
    expect(analyticsReportSessions([], [], [], ANY_ANALYTICS_FILTER)).toEqual([]);
  });
});

describe('analyticsReportTotals', () => {
  it('RT-1: sessionCount is the report session count, series-free ones included', () => {
    const matched = [series({ sessionId: 'a', values: [90, 90] })];
    const sessions = [session({ id: 'a' }), session({ id: 'rounds-only' })];
    expect(analyticsReportTotals(matched, sessions).sessionCount).toBe(2);
  });

  it('RT-2: volumeShotCount adds every report session’s extra rounds', () => {
    const matched = [series({ sessionId: 'a', values: [90, 90] })];
    const sessions = [session({ id: 'a' }), session({ id: 'rounds-only', extraRounds: 12 })];
    expect(analyticsReportTotals(matched, sessions).volumeShotCount).toBe(14);
  });

  it('RT-3: every other field is identical to analyticsTotals over the same series', () => {
    const matched = [
      series({ sessionId: 'a', values: [90, 100] }),
      series({ sessionId: 'b', values: [85] }),
    ];
    const sessions = [session({ id: 'a' }), session({ id: 'b' }), session({ id: 'c' })];
    const plain = analyticsTotals(matched);
    const report = analyticsReportTotals(matched, sessions);

    // Field by field against a live call, so a field added to AnalyticsTotals
    // later cannot silently diverge between the two.
    for (const key of Object.keys(plain) as (keyof typeof plain)[]) {
      if (key === 'sessionCount' || key === 'volumeShotCount') continue;
      expect(report[key]).toEqual(plain[key]);
    }
    expect(Object.keys(report).sort()).toEqual(Object.keys(plain).sort());
  });

  it('RT-4: no series and no sessions gives the zero totals', () => {
    expect(analyticsReportTotals([], [])).toEqual(analyticsTotals([]));
  });

  it('RT-5: a session with both series and extraRounds counts both, once', () => {
    const matched = [series({ sessionId: 'a', values: [90, 90, 90] })];
    const sessions = [session({ id: 'a', extraRounds: 7 })];
    const totals = analyticsReportTotals(matched, sessions);
    expect(totals.sessionCount).toBe(1);
    expect(totals.volumeShotCount).toBe(10);
  });

  it('V3: volumeShotCount adds every report session’s fält station rounds', () => {
    const matched = [series({ sessionId: 'a', values: [90, 90] })];
    const sessions = [
      session({ id: 'a', extraRounds: 1 }),
      session({ id: 'falt', disciplineId: 'spsf-falt', stationCount: 3 }),
    ];
    expect(analyticsReportTotals(matched, sessions).volumeShotCount).toBe(21);
  });

  it('RT-6: the sighter scope still reaches the delegated fields', () => {
    const matched = [series({ sessionId: 'a', isSighter: true, values: [90, 90] })];
    const sessions = [session({ id: 'a' })];
    expect(analyticsReportTotals(matched, sessions).scoredSeriesCount).toBe(0);
    expect(
      analyticsReportTotals(matched, sessions, { includeSighters: true }).scoredSeriesCount,
    ).toBe(1);
  });
});

describe('analyticsReportSet', () => {
  const all = [
    series({ sessionId: 'a', values: [90, 90] }),
    series({ sessionId: 'b', values: [90, 90, 90] }),
  ];
  const sessions = [
    session({ id: 'a' }),
    session({ id: 'b' }),
    session({ id: 'rounds', extraRounds: 9 }),
  ];

  it('SET-1: matchedSeries is the filtered series', () => {
    const set = analyticsReportSet(all, sessions, filter({ shotsPerSeries: 3 }));
    expect(set.matchedSeries.map((s) => s.sessionId)).toEqual(['b']);
  });

  it('SET-2: sessions and totals are the same as calling the parts, scope included', () => {
    const set = analyticsReportSet(all, sessions, ANY_ANALYTICS_FILTER);
    const expectedSessions = analyticsReportSessions(sessions, all, all, ANY_ANALYTICS_FILTER);
    expect(set.sessions).toEqual(expectedSessions);
    expect(set.totals).toEqual(analyticsReportTotals(all, expectedSessions));

    const sighter = [series({ sessionId: 'a', isSighter: true, values: [90, 90] })];
    expect(
      analyticsReportSet(sighter, [session({ id: 'a' })], ANY_ANALYTICS_FILTER).totals
        .scoredSeriesCount,
    ).toBe(0);
    expect(
      analyticsReportSet(sighter, [session({ id: 'a' })], ANY_ANALYTICS_FILTER, {
        includeSighters: true,
      }).totals.scoredSeriesCount,
    ).toBe(1);
  });

  it('SET-3: hasMatches follows the session set, not the series', () => {
    expect(analyticsReportSet(all, sessions, ANY_ANALYTICS_FILTER).hasMatches).toBe(true);
    // No series matches a 99-shot length, but the series-free session still does.
    const onlySeriesFree = analyticsReportSet(all, sessions, filter({ shotsPerSeries: 99 }));
    expect(onlySeriesFree.matchedSeries).toEqual([]);
    expect(onlySeriesFree.sessions.map((s) => s.id)).toEqual(['rounds']);
    expect(onlySeriesFree.hasMatches).toBe(true);
    expect(analyticsReportSet([], [], ANY_ANALYTICS_FILTER).hasMatches).toBe(false);
  });
});

describe('the report volume is the sum of sessionVolume (one-volume-figure-spec U7)', () => {
  it('U7: counts each report session’s matched series, total-only ones included, its extra rounds and stations', () => {
    const matched = [
      series({ sessionId: 'a', isSighter: true, values: [90, 90] }),
      series({ sessionId: 'a', totalOverride: { tenths: 450, shotCount: 5 } }),
      series({ sessionId: 'b', values: [100] }),
    ];
    const sessions = [
      session({ id: 'a', extraRounds: 3 }),
      session({ id: 'b' }),
      session({ id: 'falt', disciplineId: 'spsf-falt', stationCount: 2 }),
    ];
    expect(analyticsReportTotals(matched, sessions).volumeShotCount).toBe(2 + 5 + 3 + 1 + 12);
  });

  it('U7: counts a volume-only series (ShotLog) by its resolved count, and scores nothing for it', () => {
    const matched = [series({ sessionId: 'a', volumeOnlyShotCount: 6 })];
    const totals = analyticsReportTotals(matched, [session({ id: 'a' })]);
    expect(totals.volumeShotCount).toBe(6);
    expect(totals.scoredSeriesCount).toBe(0);
  });

  it('U7: a series of a session outside the report set does not count', () => {
    const matched = [series({ sessionId: 'elsewhere', values: [100, 100] })];
    expect(analyticsReportTotals(matched, [session({ id: 'a' })]).volumeShotCount).toBe(0);
  });
});
