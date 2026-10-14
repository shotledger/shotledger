import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_REPORT_FORMAT,
  ANALYTICS_REPORT_VERSION,
  buildAnalyticsReport,
  buildAnalyticsReportJson,
  type AnalyticsReportJsonInput,
} from './json-log';
import type { SessionExport } from '../json-export/types';

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
  eventId: null,
  firearmId: 'firearm-1',
  firearm: 'Pardini SP',
  ammoLot: 'Lot 42',
  startedAt: '2026-05-01T10:00:00.000Z',
  location: 'Range',
  notes: null,
  decimalScoring: false,
  seriesLength: null,
  extraRounds: 5,
  tags: ['Training'],
  series: [
    {
      position: 1,
      isSighter: false,
      isFinal: false,
      isShootOff: false,
      totalOverride: null,
      shots: [
        { position: 1, valueTenths: 100, isInnerTen: true },
        { position: 2, valueTenths: 90, isInnerTen: false },
      ],
    },
  ],
  faltResultMode: null,
  stations: [],
  kind: 'series',
  externalSource: null,
  externalRef: null,
  officialPlacement: null,
  officialStandardMedal: null,
};

// #308: naming the firearm is what demonstrates activity with one's own guns,
// so the report has to carry the firearm a session references — and `isOwn`
// with it.
const firearm = {
  id: 'firearm-1',
  make: 'Pardini',
  model: 'SP',
  caliber: '.22 LR',
  weaponType: 'pistol' as const,
  isOwn: true,
  serialNumber: null,
  vapenId: null,
  loadSystem: null,
  notes: null,
  roundCount: 0,
  maintenanceIntervalRounds: null,
  maintenanceIntervalMonths: null,
  archivedAt: null,
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
    includeSighters: true,
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
  firearms: [firearm],
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

  it('SS-21/SS-22: the echo says which sighter scope produced the numbers', () => {
    expect(buildAnalyticsReport(input).filter.includeSighters).toBe(true);

    const excluded = buildAnalyticsReport({
      ...input,
      filter: { ...input.filter, includeSighters: false },
    });
    expect(excluded.filter.includeSighters).toBe(false);
    expect({ ...excluded.filter, includeSighters: true }).toEqual(input.filter);
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
      firearms: [],
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

  it('L6: carries the firearms the sessions reference, with isOwn (#308)', () => {
    const report = buildAnalyticsReport(input);
    expect(report.firearms).toHaveLength(1);
    expect(report.firearms[0]?.id).toBe('firearm-1');
    expect(report.firearms[0]?.isOwn).toBe(true);
  });

  it('L7: a session resolves to a firearm in the same document', () => {
    const report = buildAnalyticsReport(input);
    const referenced = report.sessions[0]?.firearmId;
    expect(report.firearms.some((f) => f.id === referenced)).toBe(true);
  });

  it('L8: firearms is a copy, not the caller\u2019s array', () => {
    const report = buildAnalyticsReport(input);
    expect(report.firearms).not.toBe(input.firearms);
    expect(report.firearms).toEqual([...input.firearms]);
  });
});
