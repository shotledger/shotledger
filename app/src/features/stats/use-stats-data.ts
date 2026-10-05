// Statistics data layer. Since the analytics rebuild the Statistics tab is
// a *filter form* that generates a report (maintainer: "see screenshots for
// how the statistics can be generic but also generated on the fly"), so
// this file has two halves:
//
//   - `useAnalyticsFilterOptions` — what the filter form can offer (which
//     disciplines, series lengths and tags actually exist).
//   - `useAnalyticsReport` — the generated report for one filter.
//
// All math delegates to @shotledger/shared's analytics.ts/stats.ts; this
// file only does DB access, period→range resolution and label lookup.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  analyticsRecords,
  analyticsReportSet,
  analyticsSessionPoints,
  compareRecentSeries,
  compareSessionTypes,
  faltReportTotals,
  faltSessionPoints,
  filterFaltSessions,
  getDiscipline,
  goldSeriesCount,
  sampleStandardDeviationTenths,
  scoredShots,
  sighterRelation,
  tenthsToScore,
  volumeOfSeries,
  type AnalyticsFilter,
  type AnalyticsRecords,
  type AnalyticsSessionPoint,
  type AnalyticsSessionType,
  type AnalyticsTotals,
  type FaltReportTotals,
  type FaltSessionPoint,
  type SessionTypeComparison,
  type SighterRelation,
} from '@shotledger/shared';

import { db } from '@/db/client';
import {
  listAllAnalyticsSeries,
  listAllStatsSeries,
  listAnalyticsSessions,
  listFaltAnalyticsSessions,
} from '@/db/queries/stats';
import { getSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { listSessions } from '@/db/queries/sessions';
import { listTags } from '@/db/queries/tags';
import { localDayEndIso, localDayStartIso } from '@/features/dates/local-day';

export const STATS_PERIODS = ['30d', '6m', '12m', 'all', 'custom'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/** The filter form's state. Serialized into the report route's params. */
export interface AnalyticsFilterState {
  period: StatsPeriod;
  /** 'YYYY-MM-DD', only meaningful when period === 'custom'. */
  customFrom: string | null;
  customTo: string | null;
  sessionType: AnalyticsSessionType | null;
  disciplineId: string | null;
  shotsPerSeries: number | null;
  tagIds: string[];
  /**
   * Outside a session a sighter is an ordinary series (maintainer,
   * 2026-09-16), so this defaults to `true`; switching it off restores the
   * in-session rule. *Shots fired* counts sighters either way — see
   * docs/specs/sighters-in-statistics-spec.md §2.1.
   */
  includeSighters: boolean;
}

export const DEFAULT_ANALYTICS_FILTER: AnalyticsFilterState = {
  period: '6m',
  customFrom: null,
  customTo: null,
  sessionType: null,
  disciplineId: null,
  shotsPerSeries: null,
  tagIds: [],
  includeSighters: true,
};

export interface DistributionBucket {
  /** Ring value in points (0-10); X shots count under 10. */
  value: number;
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<StatsPeriod, 'all' | 'custom'>, number> = {
  '30d': 30,
  '6m': 182,
  '12m': 365,
};

export interface PeriodRange {
  fromIso: string | null;
  toIso: string | null;
}

/** The [from, to] ISO range a period filter resolves to; both null = all time. */
export function periodRange(
  filters: Pick<AnalyticsFilterState, 'period' | 'customFrom' | 'customTo'>,
): PeriodRange {
  if (filters.period === 'all') return { fromIso: null, toIso: null };
  if (filters.period === 'custom') {
    return {
      fromIso: filters.customFrom ? localDayStartIso(filters.customFrom) : null,
      toIso: filters.customTo ? localDayEndIso(filters.customTo) : null,
    };
  }
  return {
    fromIso: new Date(Date.now() - PERIOD_DAYS[filters.period] * DAY_MS).toISOString(),
    toIso: null,
  };
}

/** The form state as the pure engine's filter. */
export function toAnalyticsFilter(state: AnalyticsFilterState): AnalyticsFilter {
  const range = periodRange(state);
  return {
    fromIso: range.fromIso,
    toIso: range.toIso,
    sessionType: state.sessionType,
    disciplineId: state.disciplineId,
    shotsPerSeries: state.shotsPerSeries,
    tagIds: state.tagIds,
  };
}

/** Round-trips the filter through the report route's params. */
export function encodeAnalyticsFilter(state: AnalyticsFilterState): string {
  return JSON.stringify(state);
}

/** Never throws: a malformed param falls back to the default filter. */
export function decodeAnalyticsFilter(raw: string | undefined): AnalyticsFilterState {
  if (!raw) return DEFAULT_ANALYTICS_FILTER;
  try {
    return { ...DEFAULT_ANALYTICS_FILTER, ...(JSON.parse(raw) as Partial<AnalyticsFilterState>) };
  } catch {
    return DEFAULT_ANALYTICS_FILTER;
  }
}

/** Exported for reuse by the session-detail mini distribution (§4 M5). */
export function buildDistribution(
  shots: readonly { valueTenths: number; isInnerTen: boolean }[],
): DistributionBucket[] {
  const counts = new Map<number, number>();
  for (const shot of shots) {
    const points = Math.round(tenthsToScore(shot.valueTenths));
    counts.set(points, (counts.get(points) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));
}

// --- Filter form -------------------------------------------------------------

export interface TagOption {
  id: string;
  name: string;
}

export interface AnalyticsFilterOptions {
  hasAnyData: boolean;
  disciplineIds: string[];
  /** Series lengths that actually occur, so "shots per series" is never a guess. */
  shotsPerSeriesValues: number[];
  tags: TagOption[];
}

function loadFilterOptions(): AnalyticsFilterOptions {
  const all = listAllAnalyticsSeries(db);
  const lengths = new Set<number>();
  for (const series of all) {
    const count = volumeOfSeries(series);
    if (count > 0) lengths.add(count);
  }

  // A fält session has stations, not series, so the series scan cannot see it.
  const falt = listFaltAnalyticsSessions(db);

  return {
    hasAnyData: all.length > 0 || falt.length > 0,
    disciplineIds: [
      ...new Set([
        ...all.map((series) => series.disciplineId),
        ...falt.map((session) => session.disciplineId),
      ]),
    ].sort(),
    shotsPerSeriesValues: [...lengths].sort((a, b) => a - b),
    tags: listTags(db).map((tag) => ({ id: tag.id, name: tag.name })),
  };
}

export function useAnalyticsFilterOptions(): AnalyticsFilterOptions {
  const [options, setOptions] = useState<AnalyticsFilterOptions>(loadFilterOptions);

  useFocusEffect(
    useCallback(() => {
      setOptions(loadFilterOptions());
    }, []),
  );

  return options;
}

// --- Generated report --------------------------------------------------------

/** A record plus the human-readable session it came from. */
export interface NamedRecord {
  sessionId: string;
  startedAt: string;
  value: number;
  sessionName: string;
}

export interface AnalyticsReportData {
  hasAnyData: boolean;
  hasMatches: boolean;
  totals: AnalyticsTotals;
  sdTenths: number | null;
  /**
   * SPSF guldserier in the filtered set. Federation-specific, so the report
   * only shows the tile when it is non-zero — an ISSF or NRA user never
   * sees a metric that does not apply to them.
   */
  goldSeriesCount: number;
  /** The raw records, as the JSON export wants them. */
  records: AnalyticsRecords;
  bestSessionScore: NamedRecord | null;
  mostInnerTens: NamedRecord | null;
  mostTens: NamedRecord | null;
  points: AnalyticsSessionPoint[];
  distribution: DistributionBucket[];
  /** Ids of the sessions the filter matched — the export's working set. */
  sessionIds: string[];
  /** Names of the filter's tags, so the report can echo them instead of a count. */
  tagNames: string[];
  /** The report's fält sessions, or null when it has none. */
  falt: { totals: FaltReportTotals; points: FaltSessionPoint[] } | null;
  /**
   * False when the selected discipline scores hits: every ring card would be
   * empty, and an empty card reads as a result of zero.
   */
  showRingCards: boolean;
  /** Training vs competition (#570); only with the Type filter on All. */
  typeComparison: SessionTypeComparison[];
  /** Sighter vs competition result per discipline (#573); none with Training picked. */
  sighterRelation: SighterRelation[];
}

function loadReport(state: AnalyticsFilterState): AnalyticsReportData {
  const all = listAllAnalyticsSeries(db);
  const faltAll = listFaltAnalyticsSessions(db);
  const faltMatched = filterFaltSessions(faltAll, toAnalyticsFilter(state));
  // The sighter scope is a scoring question, not a membership one, so it
  // rides on the aggregations rather than on the filter.
  const scope = { includeSighters: state.includeSighters };
  // The session set is not "the sessions of the matched series": a session
  // with no series at all is invisible to that, which is what made the report
  // count one fewer than Home and drop a rounds-only session's extra rounds
  // from the volume (#349). The composition lives in shared so this file has
  // no wiring of its own to drift.
  const set = analyticsReportSet(all, listAnalyticsSessions(db), toAnalyticsFilter(state), scope);
  const matched = set.matchedSeries;
  const sessionIds = set.sessions.map((session) => session.id);
  const points = analyticsSessionPoints(matched, scope);
  const records: AnalyticsRecords = analyticsRecords(points);
  const shots = scoredShots(matched, scope);
  const birthYear = getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null);

  const nameById = new Map(listSessions(db).map((session) => [session.id, session.name] as const));
  const named = (record: AnalyticsRecords[keyof AnalyticsRecords]): NamedRecord | null =>
    record === null
      ? null
      : { ...record, sessionName: nameById.get(record.sessionId) ?? record.sessionId };

  return {
    hasAnyData: all.length > 0 || faltAll.length > 0,
    // The session set, not the series: a filter whose only match is a
    // rounds-only session would otherwise count 1 and then render the empty
    // state (spec revision, #349).
    hasMatches: set.hasMatches,
    // Unscored extra rounds ride on the session (spec A1 §A1.3 A-X3), so they
    // come from the session set rather than from a second query; every score
    // statistic is computed from shots/series and cannot see them (A-X4).
    totals: set.totals,
    sdTenths: sampleStandardDeviationTenths(shots),
    // No sighter scope: a sighter always counts towards a guldserie
    // (maintainer, 2026-09-17; spec §2.3).
    goldSeriesCount: goldSeriesCount(matched, { birthYear }),
    records,
    bestSessionScore: named(records.bestSessionTotalTenths),
    mostInnerTens: named(records.mostInnerTens),
    mostTens: named(records.mostTens),
    points,
    distribution: buildDistribution(shots),
    sessionIds,
    tagNames: listTags(db)
      .filter((tag) => state.tagIds.includes(tag.id))
      .map((tag) => tag.name),
    falt:
      faltMatched.length === 0
        ? null
        : { totals: faltReportTotals(faltMatched), points: faltSessionPoints(faltMatched) },
    showRingCards:
      state.disciplineId === null || getDiscipline(state.disciplineId)?.scoring !== 'hits',
    typeComparison: state.sessionType === null ? compareSessionTypes(matched, scope) : [],
    sighterRelation: state.sessionType === 'training' ? [] : sighterRelation(matched),
  };
}

export function useAnalyticsReport(state: AnalyticsFilterState): AnalyticsReportData {
  const [data, setData] = useState<AnalyticsReportData>(() => loadReport(state));
  const key = encodeAnalyticsFilter(state);

  useFocusEffect(
    useCallback(() => {
      setData(loadReport(decodeAnalyticsFilter(key)));
    }, [key]),
  );

  return data;
}

/** Comparison of the most recent 100 series vs the 100 before that, same discipline+class. */
export function loadComparisonForSession(disciplineId: string, shooterClass: string | null) {
  const all = listAllStatsSeries(db);
  return compareRecentSeries(all, { disciplineId, shooterClass });
}
