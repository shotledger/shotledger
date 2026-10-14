import { describe, expect, it } from 'vitest';

import type { AnalyticsSeries } from '../scoring/analytics';
import {
  DEFAULT_ANALYTICS_FILTER,
  buildDistribution,
  buildFilterOptions,
  composeAnalyticsReport,
  decodeAnalyticsFilter,
  encodeAnalyticsFilter,
  periodRange,
  previousPeriodRange,
} from './report';
import { statsHeadline } from './headline';
import { buildAnalyticsSeries, buildAnalyticsSessions } from './rows';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');

describe('periodRange', () => {
  it('resolves rolling periods from now, and all time to no bounds', () => {
    expect(periodRange({ period: '30d', customFrom: null, customTo: null }, NOW)).toEqual({
      fromIso: '2026-09-06T12:00:00.000Z',
      toIso: null,
    });
    expect(periodRange({ period: 'all', customFrom: null, customTo: null }, NOW)).toEqual({
      fromIso: null,
      toIso: null,
    });
  });

  it('leaves an unset custom bound open', () => {
    expect(periodRange({ period: 'custom', customFrom: null, customTo: null }, NOW)).toEqual({
      fromIso: null,
      toIso: null,
    });
  });
});

describe('filter encoding', () => {
  it('round-trips, and falls back to the default on garbage', () => {
    const state = { ...DEFAULT_ANALYTICS_FILTER, disciplineId: 'spsf-precision' };
    expect(decodeAnalyticsFilter(encodeAnalyticsFilter(state))).toEqual(state);
    expect(decodeAnalyticsFilter('{nope')).toEqual(DEFAULT_ANALYTICS_FILTER);
    expect(decodeAnalyticsFilter(undefined)).toEqual(DEFAULT_ANALYTICS_FILTER);
  });
});

describe('buildDistribution', () => {
  it('buckets by whole ring value, ascending', () => {
    expect(
      buildDistribution([
        { valueTenths: 100, isInnerTen: true },
        { valueTenths: 90, isInnerTen: false },
        { valueTenths: 100, isInnerTen: false },
      ]),
    ).toEqual([
      { value: 9, count: 1 },
      { value: 10, count: 2 },
    ]);
  });
});

const sessionRow = {
  id: 's1',
  type: 'training' as const,
  disciplineId: 'spsf-precision',
  programId: null,
  startedAt: '2026-10-01T10:00:00.000Z',
  weaponGroup: null,
  shooterClass: null,
  firearmId: null,
  ammoLotId: null,
  extraRounds: null,
  faltResultMode: null,
};

const rows = {
  sessions: [sessionRow],
  series: [
    {
      id: 'r1',
      sessionId: 's1',
      position: 1,
      isSighter: 0,
      isFinal: 0,
      isTotalOverride: 0,
      totalOverrideTenths: null,
      totalOverrideShotCount: null,
    },
  ],
  shots: [
    { seriesId: 'r1', valueTenths: 100, isInnerTen: 1 },
    { seriesId: 'r1', valueTenths: 90, isInnerTen: 0 },
  ],
  sessionTags: [],
  faltStations: [],
};

describe('buildFilterOptions', () => {
  it('offers the disciplines and series lengths that occur', () => {
    const series: AnalyticsSeries[] = buildAnalyticsSeries(rows);
    expect(buildFilterOptions({ series, falt: [], tags: [{ id: 't', name: 'Club' }] })).toEqual({
      hasAnyData: true,
      disciplineIds: ['spsf-precision'],
      shotsPerSeriesValues: [2],
      tags: [{ id: 't', name: 'Club' }],
    });
  });
});

describe('composeAnalyticsReport', () => {
  it('names the record sessions and echoes the picked tags', () => {
    const report = composeAnalyticsReport(
      { ...DEFAULT_ANALYTICS_FILTER, tagIds: [] },
      {
        series: buildAnalyticsSeries(rows),
        sessions: buildAnalyticsSessions(rows),
        falt: [],
        tags: [{ id: 't', name: 'Club' }],
        sessionNames: new Map([['s1', 'Tuesday']]),
        birthYear: null,
      },
      NOW,
    );
    expect(report).toMatchObject({
      hasAnyData: true,
      hasMatches: true,
      bestSessionScore: { sessionId: 's1', sessionName: 'Tuesday', value: 190 },
      distribution: [
        { value: 9, count: 1 },
        { value: 10, count: 1 },
      ],
      sessionIds: ['s1'],
      tagNames: [],
      falt: null,
      showRingCards: true,
    });
  });

  it('falls back to the session id when the name is unknown', () => {
    const report = composeAnalyticsReport(
      DEFAULT_ANALYTICS_FILTER,
      {
        series: buildAnalyticsSeries(rows),
        sessions: buildAnalyticsSessions(rows),
        falt: [],
        tags: [],
        sessionNames: new Map(),
        birthYear: null,
      },
      NOW,
    );
    expect(report.bestSessionScore?.sessionName).toBe('s1');
  });
});

describe('previousPeriodRange', () => {
  it('puts the same length of time just before a rolling period', () => {
    expect(previousPeriodRange({ period: '30d', customFrom: null, customTo: null }, NOW)).toEqual({
      fromIso: '2026-08-07T12:00:00.000Z',
      toIso: '2026-09-06T11:59:59.999Z',
    });
  });

  it('follows a custom range back by the same number of days', () => {
    const range = previousPeriodRange(
      { period: 'custom', customFrom: '2026-09-11', customTo: '2026-09-20' },
      NOW,
    );
    const current = periodRange({
      period: 'custom',
      customFrom: '2026-09-11',
      customTo: '2026-09-20',
    });
    expect(range).not.toBeNull();
    // Ten days long, ending a millisecond before the current range starts.
    expect(Date.parse(current.fromIso!) - Date.parse(range!.toIso!)).toBe(1);
    expect(Date.parse(range!.toIso!) + 1 - Date.parse(range!.fromIso!)).toBe(
      Date.parse(current.toIso!) + 1 - Date.parse(current.fromIso!),
    );
  });

  it('has no previous period for all time or an open custom range', () => {
    expect(
      previousPeriodRange({ period: 'all', customFrom: null, customTo: null }, NOW),
    ).toBeNull();
    expect(
      previousPeriodRange({ period: 'custom', customFrom: null, customTo: '2026-09-20' }, NOW),
    ).toBeNull();
  });
});

describe('statsHeadline', () => {
  const twoSessions = {
    sessions: [
      sessionRow,
      {
        ...sessionRow,
        id: 's0',
        type: 'competition' as const,
        startedAt: '2026-08-20T10:00:00.000Z',
      },
    ],
    series: [...rows.series, { ...rows.series[0]!, id: 'r0', sessionId: 's0' }],
    shots: [
      ...rows.shots,
      { seriesId: 'r0', valueTenths: 80, isInnerTen: 0 },
      { seriesId: 'r0', valueTenths: 80, isInnerTen: 0 },
    ],
    sessionTags: [],
    faltStations: [],
  };
  const inputs = {
    series: buildAnalyticsSeries(twoSessions),
    sessions: buildAnalyticsSessions(twoSessions),
    falt: [],
    tags: [],
    sessionNames: new Map<string, string>(),
    birthYear: null,
  };
  const state = { ...DEFAULT_ANALYTICS_FILTER, period: '30d' as const };

  it('compares the average series with the previous equal period', () => {
    const current = composeAnalyticsReport(state, inputs, NOW);
    const previous = composeAnalyticsReport(state, inputs, NOW, previousPeriodRange(state, NOW)!);
    expect(current.sessionIds).toEqual(['s1']);
    expect(previous.sessionIds).toEqual(['s0']);
    expect(previous.competitionCount).toBe(1);
    expect(current.competitionCount).toBe(0);
    expect(statsHeadline(current, previous)).toEqual({
      kind: 'meanPerSeries',
      value: 19,
      previous: 16,
      delta: 3,
    });
  });

  it('has no trend without a previous period', () => {
    const current = composeAnalyticsReport(state, inputs, NOW);
    expect(statsHeadline(current, null)).toEqual({
      kind: 'meanPerSeries',
      value: 19,
      previous: null,
      delta: null,
    });
  });
});
