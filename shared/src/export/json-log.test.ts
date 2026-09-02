import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_REPORT_FORMAT,
  ANALYTICS_REPORT_VERSION,
  buildAnalyticsReport,
  buildAnalyticsReportJson,
  type AnalyticsReportJsonInput,
} from './json-log';
import type { SessionExport } from '../csv/types';

const session: SessionExport = {
  id: 'session-1',
  name: 'Tuesday practice',
  type: 'training',
  disciplineId: 'spsf-precision',
  programId: null,
  competitionLevel: null,
  isChampionship: false,
  competitionName: null,
  weaponGroup: 'spsf:C',
  shooterClass: '2',
  firearm: 'Pardini SP',
  ammoLot: 'Lot 42',
  startedAt: '2026-05-01T10:00:00.000Z',
  location: 'Range',
  notes: null,
  decimalScoring: false,
  extraRounds: 5,
  tags: ['Training'],
  series: [
    {
      position: 1,
      isSighter: false,
      isFinal: false,
      shots: [
        { position: 1, valueTenths: 100, isInnerTen: true },
        { position: 2, valueTenths: 90, isInnerTen: false },
      ],
    },
  ],
};

const input: AnalyticsReportJsonInput = {
  generatedAt: '2026-09-03T08:00:00.000Z',
  filter: {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-09-03T23:59:59.999Z',
    sessionType: 'training',
    disciplineId: 'spsf-precision',
    shotsPerSeries: 5,
    tags: ['Training'],
  },
  totals: {
    sessionCount: 3,
    scoredSeriesCount: 12,
    volumeShotCount: 65,
    scoredShotCount: 60,
    sumTenths: 5432,
    meanShotTenths: 90.53333333333333,
    meanSeriesTenths: 452.6666666666667,
    innerTenCount: 7,
    tenCount: 21,
  },
  records: {
    bestSessionTotalTenths: {
      sessionId: 'session-1',
      startedAt: '2026-05-01T10:00:00.000Z',
      value: 965,
    },
    mostInnerTens: { sessionId: 'session-2', startedAt: '2026-06-01T10:00:00.000Z', value: 4 },
    mostTens: { sessionId: 'session-2', startedAt: '2026-06-01T10:00:00.000Z', value: 12 },
  },
  sessions: [session],
};

describe('buildAnalyticsReport', () => {
  it('stamps the format and version first, so a consumer can dispatch on them', () => {
    const report = buildAnalyticsReport(input);
    expect(Object.keys(report).slice(0, 3)).toEqual(['format', 'version', 'generatedAt']);
    expect(report.format).toBe(ANALYTICS_REPORT_FORMAT);
    expect(report.version).toBe(ANALYTICS_REPORT_VERSION);
    expect(report.generatedAt).toBe('2026-09-03T08:00:00.000Z');
  });

  it('echoes the filter unchanged', () => {
    expect(buildAnalyticsReport(input).filter).toEqual(input.filter);
  });

  it('reports scores in points, never tenths', () => {
    const { summary, records } = buildAnalyticsReport(input);
    expect(summary.totalScore).toBe(543.2);
    expect(summary.meanScorePerShot).toBe(9.053);
    expect(summary.meanScorePerSeries).toBe(45.267);
    expect(records.bestSessionScore).toEqual({
      sessionId: 'session-1',
      startedAt: '2026-05-01T10:00:00.000Z',
      value: 96.5,
    });
  });

  it('leaves count records as plain counts', () => {
    const { records } = buildAnalyticsReport(input);
    expect(records.mostInnerTens).toEqual({
      sessionId: 'session-2',
      startedAt: '2026-06-01T10:00:00.000Z',
      value: 4,
    });
    expect(records.mostTens?.value).toBe(12);
  });

  it('carries both the sum and the per-shot figures', () => {
    expect(buildAnalyticsReport(input).summary).toEqual({
      sessionCount: 3,
      scoredSeriesCount: 12,
      shotsFired: 65,
      scoredShotCount: 60,
      totalScore: 543.2,
      meanScorePerShot: 9.053,
      meanScorePerSeries: 45.267,
      innerTenCount: 7,
      tenCount: 21,
    });
  });

  it('keeps null means and null records null rather than inventing a zero', () => {
    const report = buildAnalyticsReport({
      ...input,
      totals: {
        sessionCount: 0,
        scoredSeriesCount: 0,
        volumeShotCount: 0,
        scoredShotCount: 0,
        sumTenths: 0,
        meanShotTenths: null,
        meanSeriesTenths: null,
        innerTenCount: 0,
        tenCount: 0,
      },
      records: { bestSessionTotalTenths: null, mostInnerTens: null, mostTens: null },
      sessions: [],
    });
    expect(report.summary.meanScorePerShot).toBeNull();
    expect(report.summary.meanScorePerSeries).toBeNull();
    expect(report.records).toEqual({
      bestSessionScore: null,
      mostInnerTens: null,
      mostTens: null,
    });
    expect(report.sessions).toEqual([]);
  });

  it('carries the filtered sessions in the CSV exporter shape', () => {
    const report = buildAnalyticsReport(input);
    expect(report.sessions).toEqual([session]);
    expect(report.sessions).not.toBe(input.sessions);
  });
});

describe('buildAnalyticsReportJson', () => {
  it('produces pretty-printed JSON that round-trips to the same object', () => {
    const text = buildAnalyticsReportJson(input);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "format": "shotledger.analytics-report",');
    expect(JSON.parse(text)).toEqual(buildAnalyticsReport(input));
  });

  it('is byte-stable for the same input', () => {
    expect(buildAnalyticsReportJson(input)).toBe(buildAnalyticsReportJson(input));
  });
});
