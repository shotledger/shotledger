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
} from './report';
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
