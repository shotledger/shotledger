// Spec: docs/specs/analytics-report-spec.md §"Behaviors — analytics.ts".
// Each `A-xN` tag in a test name is the behavior it asserts.
import { describe, expect, it } from 'vitest';

import {
  analyticsRecords,
  analyticsSessionPoints,
  analyticsTotals,
  ANY_ANALYTICS_FILTER,
  filterAnalyticsSeries,
  type AnalyticsFilter,
  type AnalyticsSeries,
} from './analytics';

type SeriesOverrides = Partial<AnalyticsSeries> & { values?: readonly number[] };

let seq = 0;

/** A minimal series; `values` is shorthand for plain non-inner-ten shots. */
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

function filter(overrides: Partial<AnalyticsFilter> = {}): AnalyticsFilter {
  return { ...ANY_ANALYTICS_FILTER, ...overrides };
}

describe('filterAnalyticsSeries', () => {
  it('A-F1: the any-filter returns the input unchanged, in order', () => {
    const list = [series({ id: 'a' }), series({ id: 'b' }), series({ id: 'c' })];
    expect(filterAnalyticsSeries(list, ANY_ANALYTICS_FILTER).map((s) => s.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('A-F2: date bounds are inclusive at both ends', () => {
    const list = [
      series({ id: 'before', startedAt: '2026-04-30T23:59:59.999Z' }),
      series({ id: 'from', startedAt: '2026-05-01T00:00:00.000Z' }),
      series({ id: 'mid', startedAt: '2026-05-15T00:00:00.000Z' }),
      series({ id: 'to', startedAt: '2026-05-31T23:59:59.999Z' }),
      series({ id: 'after', startedAt: '2026-06-01T00:00:00.000Z' }),
    ];
    const kept = filterAnalyticsSeries(
      list,
      filter({ fromIso: '2026-05-01T00:00:00.000Z', toIso: '2026-05-31T23:59:59.999Z' }),
    );
    expect(kept.map((s) => s.id)).toEqual(['from', 'mid', 'to']);
  });

  it('A-F2: an open-ended range bounds only the side that is set', () => {
    const list = [
      series({ id: 'old', startedAt: '2025-01-01T00:00:00.000Z' }),
      series({ id: 'new', startedAt: '2026-08-01T00:00:00.000Z' }),
    ];
    expect(
      filterAnalyticsSeries(list, filter({ fromIso: '2026-01-01T00:00:00.000Z' })).map((s) => s.id),
    ).toEqual(['new']);
    expect(
      filterAnalyticsSeries(list, filter({ toIso: '2026-01-01T00:00:00.000Z' })).map((s) => s.id),
    ).toEqual(['old']);
  });

  it('A-F3: sessionType keeps one kind; null keeps both', () => {
    const list = [
      series({ id: 'practice', sessionType: 'training' }),
      series({ id: 'comp', sessionType: 'competition' }),
    ];
    expect(
      filterAnalyticsSeries(list, filter({ sessionType: 'competition' })).map((s) => s.id),
    ).toEqual(['comp']);
    expect(
      filterAnalyticsSeries(list, filter({ sessionType: 'training' })).map((s) => s.id),
    ).toEqual(['practice']);
    expect(filterAnalyticsSeries(list, filter()).length).toBe(2);
  });

  it('A-F4: disciplineId matches exactly', () => {
    const list = [
      series({ id: 'precision', disciplineId: 'spsf-precision' }),
      series({ id: 'generic', disciplineId: 'generic-ring' }),
    ];
    expect(
      filterAnalyticsSeries(list, filter({ disciplineId: 'generic-ring' })).map((s) => s.id),
    ).toEqual(['generic']);
  });

  it('A-F5: shotsPerSeries matches the fired shot count', () => {
    const list = [
      series({ id: 'five', values: [100, 90, 90, 80, 80] }),
      series({ id: 'ten', values: Array.from({ length: 10 }, () => 90) }),
    ];
    expect(filterAnalyticsSeries(list, filter({ shotsPerSeries: 5 })).map((s) => s.id)).toEqual([
      'five',
    ]);
    expect(filterAnalyticsSeries(list, filter({ shotsPerSeries: 10 })).map((s) => s.id)).toEqual([
      'ten',
    ]);
  });

  it('A-F5: an imported override series is filterable by its stored shot count', () => {
    const list = [
      series({ id: 'imported', totalOverride: { tenths: 940, shotCount: 10 } }),
      series({ id: 'local', values: [100, 100, 100, 100, 100] }),
    ];
    expect(filterAnalyticsSeries(list, filter({ shotsPerSeries: 10 })).map((s) => s.id)).toEqual([
      'imported',
    ]);
  });

  it('A-F6: tagIds is an OR-match, and an empty list keeps untagged series', () => {
    const list = [
      series({ id: 'km', tagIds: ['t-km', 't-comp'] }),
      series({ id: 'training', tagIds: ['t-training'] }),
      series({ id: 'untagged', tagIds: [] }),
    ];
    expect(filterAnalyticsSeries(list, filter({ tagIds: ['t-km'] })).map((s) => s.id)).toEqual([
      'km',
    ]);
    expect(
      filterAnalyticsSeries(list, filter({ tagIds: ['t-km', 't-training'] })).map((s) => s.id),
    ).toEqual(['km', 'training']);
    expect(filterAnalyticsSeries(list, filter({ tagIds: [] })).length).toBe(3);
    expect(filterAnalyticsSeries(list, filter({ tagIds: ['t-none'] }))).toEqual([]);
  });

  it('A-F7: fields compose with AND', () => {
    const list = [
      series({
        id: 'match',
        sessionType: 'competition',
        disciplineId: 'spsf-precision',
        tagIds: ['t-km'],
        values: [100, 100, 100, 100, 100],
      }),
      series({
        id: 'wrong-type',
        sessionType: 'training',
        disciplineId: 'spsf-precision',
        tagIds: ['t-km'],
        values: [100, 100, 100, 100, 100],
      }),
      series({
        id: 'wrong-length',
        sessionType: 'competition',
        disciplineId: 'spsf-precision',
        tagIds: ['t-km'],
        values: [100, 100, 100],
      }),
    ];
    const kept = filterAnalyticsSeries(
      list,
      filter({
        sessionType: 'competition',
        disciplineId: 'spsf-precision',
        shotsPerSeries: 5,
        tagIds: ['t-km'],
      }),
    );
    expect(kept.map((s) => s.id)).toEqual(['match']);
  });

  it('A-F8: sighter series survive filtering', () => {
    const list = [series({ id: 'sighter', isSighter: true, values: [50, 50, 50] })];
    expect(filterAnalyticsSeries(list, ANY_ANALYTICS_FILTER).map((s) => s.id)).toEqual(['sighter']);
  });
});

describe('analyticsSessionPoints', () => {
  it('A-P1/A-P6/A-P7: sighters contribute nothing; tens include centrumtior', () => {
    const [point] = analyticsSessionPoints([
      series({
        isSighter: true,
        shots: [
          { valueTenths: 100, isInnerTen: true },
          { valueTenths: 100, isInnerTen: false },
        ],
      }),
      series({
        shots: [
          { valueTenths: 100, isInnerTen: true },
          { valueTenths: 105, isInnerTen: false },
          { valueTenths: 99, isInnerTen: false },
        ],
      }),
    ]);
    expect(point).toMatchObject({
      scoredSeriesCount: 1,
      scoredShotCount: 3,
      sessionTotalTenths: 304,
      innerTenCount: 1,
      tenCount: 2,
    });
  });

  it('A-P7: 9.9 is not a ten and 10.0 is', () => {
    const [point] = analyticsSessionPoints([series({ values: [99, 100] })]);
    expect(point!.tenCount).toBe(1);
  });

  it('A-P2: an override series contributes its stored total', () => {
    const [point] = analyticsSessionPoints([
      series({ totalOverride: { tenths: 940, shotCount: 10 } }),
      series({ values: [100, 100] }),
    ]);
    expect(point).toMatchObject({
      sessionTotalTenths: 1140,
      scoredSeriesCount: 2,
      scoredShotCount: 2,
      meanShotTenths: 100,
    });
  });

  it('A-P3/A-P4: an empty series is not counted and never drags the mean', () => {
    const [point] = analyticsSessionPoints([
      series({ values: [100, 100, 100, 100, 100] }),
      series({ values: [] }),
    ]);
    expect(point).toMatchObject({ scoredSeriesCount: 1, meanSeriesTotalTenths: 500 });
  });

  it('A-P4/A-P5: a session with nothing scored reports null means, not zero', () => {
    const [point] = analyticsSessionPoints([series({ isSighter: true, values: [100, 100] })]);
    expect(point).toMatchObject({
      scoredSeriesCount: 0,
      scoredShotCount: 0,
      sessionTotalTenths: 0,
      meanSeriesTotalTenths: null,
      meanShotTenths: null,
    });
  });

  it('A-P4: the series mean divides the total by the scored series count', () => {
    const [point] = analyticsSessionPoints([
      series({ values: [100, 100, 100, 100, 100] }),
      series({ values: [90, 90, 90, 90, 90] }),
    ]);
    expect(point!.meanSeriesTotalTenths).toBe(475);
  });

  it('A-P8: points are chronological, ties broken by session id', () => {
    const points = analyticsSessionPoints([
      series({ sessionId: 'c', startedAt: '2026-06-01T10:00:00.000Z' }),
      series({ sessionId: 'b', startedAt: '2026-05-01T10:00:00.000Z' }),
      series({ sessionId: 'a', startedAt: '2026-05-01T10:00:00.000Z' }),
    ]);
    expect(points.map((p) => p.sessionId)).toEqual(['a', 'b', 'c']);
    expect(points[0]!.startedAt).toBe('2026-05-01T10:00:00.000Z');
  });

  it('A-P9: an empty input gives no points', () => {
    expect(analyticsSessionPoints([])).toEqual([]);
  });

  // #349: a chart cannot draw one line per discipline without knowing which
  // discipline a point belongs to.
  it('AP-1: a point carries its session\u2019s discipline', () => {
    const [point] = analyticsSessionPoints([
      series({ sessionId: 'a', disciplineId: 'spsf-milsnabb', values: [90] }),
    ]);
    expect(point!.disciplineId).toBe('spsf-milsnabb');
  });
});

describe('analyticsRecords', () => {
  const points = analyticsSessionPoints([
    series({ sessionId: 'a', startedAt: '2026-05-01T10:00:00.000Z', values: [90, 90, 90, 90, 90] }),
    series({
      sessionId: 'b',
      startedAt: '2026-06-01T10:00:00.000Z',
      shots: [
        { valueTenths: 100, isInnerTen: true },
        { valueTenths: 100, isInnerTen: true },
        { valueTenths: 100, isInnerTen: false },
        { valueTenths: 90, isInnerTen: false },
        { valueTenths: 90, isInnerTen: false },
      ],
    }),
  ]);

  it('A-R1/A-R2: each record names the session it came from', () => {
    const records = analyticsRecords(points);
    expect(records.bestSessionTotalTenths).toEqual({
      sessionId: 'b',
      startedAt: '2026-06-01T10:00:00.000Z',
      value: 480,
    });
    expect(records.mostInnerTens).toMatchObject({ sessionId: 'b', value: 2 });
    expect(records.mostTens).toMatchObject({ sessionId: 'b', value: 3 });
  });

  it('A-R2: a set with no inner tens still records a zero-valued best', () => {
    const records = analyticsRecords(
      analyticsSessionPoints([series({ sessionId: 'a', values: [90, 90] })]),
    );
    expect(records.mostInnerTens).toMatchObject({ sessionId: 'a', value: 0 });
  });

  it('A-R1/A-R2: sessions with nothing scored are not candidates', () => {
    const records = analyticsRecords(
      analyticsSessionPoints([
        series({ sessionId: 'sighter-only', isSighter: true, values: [90] }),
      ]),
    );
    expect(records).toEqual({
      bestSessionTotalTenths: null,
      mostInnerTens: null,
      mostTens: null,
    });
  });

  it('A-R1: an override-only session is a total candidate but not a shot candidate', () => {
    const records = analyticsRecords(
      analyticsSessionPoints([
        series({ sessionId: 'imported', totalOverride: { tenths: 940, shotCount: 10 } }),
      ]),
    );
    expect(records.bestSessionTotalTenths).toMatchObject({ sessionId: 'imported', value: 940 });
    expect(records.mostInnerTens).toBeNull();
    expect(records.mostTens).toBeNull();
  });

  it('A-R3: ties keep the earliest session', () => {
    const tied = analyticsSessionPoints([
      series({ sessionId: 'later', startedAt: '2026-06-01T10:00:00.000Z', values: [100, 100] }),
      series({ sessionId: 'earlier', startedAt: '2026-05-01T10:00:00.000Z', values: [100, 100] }),
    ]);
    expect(analyticsRecords(tied).bestSessionTotalTenths).toMatchObject({ sessionId: 'earlier' });
    expect(analyticsRecords(tied).mostTens).toMatchObject({ sessionId: 'earlier' });
  });

  it('R1: two helmatch sessions tied on the total rank by C, then B (SHB I.6.11.2.1)', () => {
    // Both 140: "first" has the higher B, "second" the higher C — C wins.
    const helmatch = (sessionId: string, startedAt: string, a: number, b: number, c: number) => [
      series({ sessionId, startedAt, disciplineId: 'spsf-helmatch', stage: 'A', values: [a] }),
      series({ sessionId, startedAt, disciplineId: 'spsf-helmatch', stage: 'B', values: [b] }),
      series({ sessionId, startedAt, disciplineId: 'spsf-helmatch', stage: 'C', values: [c] }),
    ];
    const points = analyticsSessionPoints([
      ...helmatch('first', '2026-05-01T10:00:00.000Z', 50, 50, 40),
      ...helmatch('second', '2026-06-01T10:00:00.000Z', 50, 40, 50),
    ]);
    expect(points.map((point) => point.tieBreakTenths)).toEqual([
      [40, 50],
      [50, 40],
    ]);
    expect(analyticsRecords(points).bestSessionTotalTenths).toMatchObject({
      sessionId: 'second',
      value: 140,
    });
  });

  it('R3: a precision session carries no tie-break keys', () => {
    expect(analyticsSessionPoints([series({ values: [90] })])[0]?.tieBreakTenths).toEqual([]);
  });

  it('A-R4: no points means no records', () => {
    expect(analyticsRecords([])).toEqual({
      bestSessionTotalTenths: null,
      mostInnerTens: null,
      mostTens: null,
    });
  });
});

describe('analyticsTotals', () => {
  const list: AnalyticsSeries[] = [
    series({ sessionId: 'a', isSighter: true, values: [50, 50, 50] }),
    series({
      sessionId: 'a',
      shots: [
        { valueTenths: 100, isInnerTen: true },
        { valueTenths: 90, isInnerTen: false },
      ],
    }),
    series({ sessionId: 'b', totalOverride: { tenths: 940, shotCount: 10 } }),
    series({ sessionId: 'b', values: [] }),
  ];

  it('A-T1..A-T4: sums and per-shot figures side by side', () => {
    expect(analyticsTotals(list)).toEqual({
      sessionCount: 2,
      scoredSeriesCount: 2,
      volumeShotCount: 15,
      scoredShotCount: 2,
      sumTenths: 1130,
      meanShotTenths: 95,
      meanSeriesTenths: 565,
      innerTenCount: 1,
      tenCount: 1,
    });
  });

  it('A-T5: an empty set counts zero and means null', () => {
    expect(analyticsTotals([])).toEqual({
      sessionCount: 0,
      scoredSeriesCount: 0,
      volumeShotCount: 0,
      scoredShotCount: 0,
      sumTenths: 0,
      meanShotTenths: null,
      meanSeriesTenths: null,
      innerTenCount: 0,
      tenCount: 0,
    });
  });

  it('A-T4: tenCount takes only shots at 10.0 and above', () => {
    const totals = analyticsTotals([series({ values: [100, 105, 99] })]);
    expect(totals).toMatchObject({ scoredShotCount: 3, tenCount: 2 });
  });

  it('A-T1: a sighter-only session still counts as a session', () => {
    const totals = analyticsTotals([series({ sessionId: 'x', isSighter: true, values: [90, 90] })]);
    expect(totals).toMatchObject({ sessionCount: 1, scoredSeriesCount: 0, volumeShotCount: 2 });
  });

  it('A-T6: totals agree with the per-session points', () => {
    const totals = analyticsTotals(list);
    const points = analyticsSessionPoints(list);
    const sum = (pick: (p: (typeof points)[number]) => number) =>
      points.reduce((acc, point) => acc + pick(point), 0);

    expect(sum((p) => p.sessionTotalTenths)).toBe(totals.sumTenths);
    expect(sum((p) => p.scoredSeriesCount)).toBe(totals.scoredSeriesCount);
    expect(sum((p) => p.scoredShotCount)).toBe(totals.scoredShotCount);
    expect(sum((p) => p.innerTenCount)).toBe(totals.innerTenCount);
    expect(sum((p) => p.tenCount)).toBe(totals.tenCount);
    expect(points.length).toBe(totals.sessionCount);
  });
});
