// JSON export of a generated analytics report (maintainer request: "for
// exports to PDF I would like to have JSON available as well"). Pure
// shaping — no I/O, no RN — so it is plain-vitest testable, like its
// sibling pdf-log.ts.
//
// The shape is a documented, stable contract: `format` + `version` are the
// first two keys so a consumer can dispatch on them, scores are in display
// points (never tenths, which are an internal storage detail), and the
// session bodies reuse the CSV exporter's `SessionExport` shape so both
// exports describe the same data the same way.
//
// The document vault is never part of this — it is out of the export
// boundary by design (see shared/src/vault).

import type { AnalyticsRecord, AnalyticsRecords, AnalyticsTotals } from '../scoring/analytics';
import type { SessionExport } from '../csv/types';
import { tenthsToScore } from '../scoring/totals';

export const ANALYTICS_REPORT_FORMAT = 'shotledger.analytics-report';
export const ANALYTICS_REPORT_VERSION = 1;

/** Echo of the filter that produced the report, in the report itself. */
export interface AnalyticsReportJsonFilter {
  /** Inclusive ISO-8601 bounds; `null` = unbounded. */
  from: string | null;
  to: string | null;
  sessionType: 'training' | 'competition' | null;
  disciplineId: string | null;
  shotsPerSeries: number | null;
  /** Tag **names**, not ids — the ids are meaningless outside the device. */
  tags: string[];
}

export interface AnalyticsReportJsonRecord {
  sessionId: string;
  startedAt: string;
  /** Score records are in points; count records are plain counts. */
  value: number;
}

export interface AnalyticsReportJsonSummary {
  sessionCount: number;
  scoredSeriesCount: number;
  /** Every round fired, sighters included. */
  shotsFired: number;
  scoredShotCount: number;
  /** Sum of the scored series' totals, in points. */
  totalScore: number;
  meanScorePerShot: number | null;
  meanScorePerSeries: number | null;
  innerTenCount: number;
  tenCount: number;
}

export interface AnalyticsReportJson {
  format: typeof ANALYTICS_REPORT_FORMAT;
  version: typeof ANALYTICS_REPORT_VERSION;
  generatedAt: string;
  filter: AnalyticsReportJsonFilter;
  summary: AnalyticsReportJsonSummary;
  records: {
    bestSessionScore: AnalyticsReportJsonRecord | null;
    mostInnerTens: AnalyticsReportJsonRecord | null;
    mostTens: AnalyticsReportJsonRecord | null;
  };
  sessions: SessionExport[];
}

export interface AnalyticsReportJsonInput {
  generatedAt: string;
  filter: AnalyticsReportJsonFilter;
  totals: AnalyticsTotals;
  records: AnalyticsRecords;
  /** The filtered sessions, assembled by the same code the CSV export uses. */
  sessions: readonly SessionExport[];
}

/**
 * Means carry float noise (95.30000000000001) that would churn the file
 * byte-for-byte between otherwise identical exports. Three decimals is
 * beyond any scoring precision the app stores.
 */
function roundMean(tenths: number | null): number | null {
  return tenths === null ? null : Math.round(tenthsToScore(tenths) * 1000) / 1000;
}

function toScoreRecord(record: AnalyticsRecord | null): AnalyticsReportJsonRecord | null {
  return record === null
    ? null
    : {
        sessionId: record.sessionId,
        startedAt: record.startedAt,
        value: tenthsToScore(record.value),
      };
}

function toCountRecord(record: AnalyticsRecord | null): AnalyticsReportJsonRecord | null {
  return record === null
    ? null
    : { sessionId: record.sessionId, startedAt: record.startedAt, value: record.value };
}

/** Builds the report object. Pure. */
export function buildAnalyticsReport(input: AnalyticsReportJsonInput): AnalyticsReportJson {
  const { totals } = input;

  return {
    format: ANALYTICS_REPORT_FORMAT,
    version: ANALYTICS_REPORT_VERSION,
    generatedAt: input.generatedAt,
    filter: input.filter,
    summary: {
      sessionCount: totals.sessionCount,
      scoredSeriesCount: totals.scoredSeriesCount,
      shotsFired: totals.volumeShotCount,
      scoredShotCount: totals.scoredShotCount,
      totalScore: tenthsToScore(totals.sumTenths),
      meanScorePerShot: roundMean(totals.meanShotTenths),
      meanScorePerSeries: roundMean(totals.meanSeriesTenths),
      innerTenCount: totals.innerTenCount,
      tenCount: totals.tenCount,
    },
    records: {
      bestSessionScore: toScoreRecord(input.records.bestSessionTotalTenths),
      mostInnerTens: toCountRecord(input.records.mostInnerTens),
      mostTens: toCountRecord(input.records.mostTens),
    },
    sessions: [...input.sessions],
  };
}

/** The report as a pretty-printed JSON document, ready to write to a file. */
export function buildAnalyticsReportJson(input: AnalyticsReportJsonInput): string {
  return `${JSON.stringify(buildAnalyticsReport(input), null, 2)}\n`;
}
