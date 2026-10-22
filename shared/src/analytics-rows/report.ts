// The Statistics report, composed from the built inputs (rows.ts) and the
// filter form's state. Shared so the phone and the web app (ARCHITECTURE.md § Web app) render
// the same numbers; the screens keep only loading and presentation.
import { localDayEndIso, localDayStartIso } from '../dates';
import { getDiscipline } from '../disciplines';
import {
  analyticsRecords,
  analyticsReportSet,
  analyticsSessionPoints,
  type AnalyticsFilter,
  type AnalyticsRecords,
  type AnalyticsSeries,
  type AnalyticsSession,
  type AnalyticsSessionPoint,
  type AnalyticsSessionType,
  type AnalyticsTotals,
} from '../scoring/analytics';
import {
  faltReportTotals,
  faltSessionPoints,
  filterFaltSessions,
  type FaltAnalyticsSession,
  type FaltReportTotals,
  type FaltSessionPoint,
} from '../scoring/falt-analytics';
import {
  compareSessionTypes,
  type SessionTypeComparison,
} from '../scoring/session-type-comparison';
import { sighterRelation, type SighterRelation } from '../scoring/sighter-relation';
import { goldSeriesCount, sampleStandardDeviationTenths, scoredShots } from '../scoring/stats';
import { tenthsToScore } from '../scoring/totals';
import { volumeOfSeries } from '../scoring/volume';

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
  nowMs: number = Date.now(),
): PeriodRange {
  if (filters.period === 'all') return { fromIso: null, toIso: null };
  if (filters.period === 'custom') {
    return {
      fromIso: filters.customFrom ? localDayStartIso(filters.customFrom) : null,
      toIso: filters.customTo ? localDayEndIso(filters.customTo) : null,
    };
  }
  return {
    fromIso: new Date(nowMs - PERIOD_DAYS[filters.period] * DAY_MS).toISOString(),
    toIso: null,
  };
}

/**
 * The period of equal length just before the filter's own, which the
 * Statistics headline compares against (#822). `null` when there is no such
 * period: all time, or a custom range missing an end.
 *
 * A rolling period ends now, so the one before it is the same length ending
 * where it starts; a custom range of whole days is followed back by the same
 * number of whole days. Both bounds are inclusive in the engine, so the
 * earlier period ends a millisecond before the later one starts and no
 * session lands in both.
 */
export function previousPeriodRange(
  filters: Pick<AnalyticsFilterState, 'period' | 'customFrom' | 'customTo'>,
  nowMs: number = Date.now(),
): PeriodRange | null {
  if (filters.period === 'all') return null;
  const current = periodRange(filters, nowMs);
  if (current.fromIso === null) return null;
  const fromMs = Date.parse(current.fromIso);
  const toMs = current.toIso === null ? nowMs : Date.parse(current.toIso) + 1;
  if (!(toMs > fromMs)) return null;
  return {
    fromIso: new Date(fromMs - (toMs - fromMs)).toISOString(),
    toIso: new Date(fromMs - 1).toISOString(),
  };
}

/**
 * The form state as the pure engine's filter. `range` replaces the period's
 * own bounds — how the previous period is composed with every other filter
 * kept.
 */
export function toAnalyticsFilter(
  state: AnalyticsFilterState,
  nowMs?: number,
  range: PeriodRange = periodRange(state, nowMs),
): AnalyticsFilter {
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

export function buildFilterOptions(inputs: {
  series: readonly AnalyticsSeries[];
  /** A fält session has stations, not series, so the series cannot show it. */
  falt: readonly FaltAnalyticsSession[];
  tags: readonly TagOption[];
}): AnalyticsFilterOptions {
  const lengths = new Set<number>();
  for (const series of inputs.series) {
    const count = volumeOfSeries(series);
    if (count > 0) lengths.add(count);
  }
  return {
    hasAnyData: inputs.series.length > 0 || inputs.falt.length > 0,
    disciplineIds: [
      ...new Set([
        ...inputs.series.map((series) => series.disciplineId),
        ...inputs.falt.map((session) => session.disciplineId),
      ]),
    ].sort(),
    shotsPerSeriesValues: [...lengths].sort((a, b) => a - b),
    tags: inputs.tags.map((tag) => ({ id: tag.id, name: tag.name })),
  };
}

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
  /** Competition sessions among the matched ones (Home's lifetime count, filtered). */
  competitionCount: number;
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

export function composeAnalyticsReport(
  state: AnalyticsFilterState,
  inputs: {
    series: readonly AnalyticsSeries[];
    sessions: readonly AnalyticsSession[];
    falt: readonly FaltAnalyticsSession[];
    tags: readonly TagOption[];
    sessionNames: ReadonlyMap<string, string>;
    birthYear: number | null;
  },
  nowMs?: number,
  /** Bounds that replace the period's own; see `toAnalyticsFilter`. */
  range?: PeriodRange,
): AnalyticsReportData {
  const filter = toAnalyticsFilter(state, nowMs, range);
  const faltMatched = filterFaltSessions([...inputs.falt], filter);
  // The sighter scope is a scoring question, not a membership one, so it
  // rides on the aggregations rather than on the filter.
  const scope = { includeSighters: state.includeSighters };
  // The session set is not "the sessions of the matched series": a session
  // with no series at all is invisible to that (#349).
  const set = analyticsReportSet([...inputs.series], [...inputs.sessions], filter, scope);
  const matched = set.matchedSeries;
  const points = analyticsSessionPoints(matched, scope);
  const records: AnalyticsRecords = analyticsRecords(points);
  const shots = scoredShots(matched, scope);

  const named = (record: AnalyticsRecords[keyof AnalyticsRecords]): NamedRecord | null =>
    record === null
      ? null
      : { ...record, sessionName: inputs.sessionNames.get(record.sessionId) ?? record.sessionId };

  return {
    hasAnyData: inputs.series.length > 0 || inputs.falt.length > 0,
    // The session set, not the series: a filter whose only match is a
    // rounds-only session would otherwise count 1 and then render the empty
    // state (#349).
    hasMatches: set.hasMatches,
    // Unscored extra rounds ride on the session (spec A1 §A1.3 A-X3); every
    // score statistic is computed from shots/series and cannot see them.
    totals: set.totals,
    competitionCount: set.sessions.filter((session) => session.sessionType === 'competition')
      .length,
    sdTenths: sampleStandardDeviationTenths(shots),
    // No sighter scope: a sighter always counts towards a guldserie
    // (maintainer, 2026-09-17; spec §2.3).
    goldSeriesCount: goldSeriesCount(matched, { birthYear: inputs.birthYear }),
    records,
    bestSessionScore: named(records.bestSessionTotalTenths),
    mostInnerTens: named(records.mostInnerTens),
    mostTens: named(records.mostTens),
    points,
    distribution: buildDistribution(shots),
    sessionIds: set.sessions.map((session) => session.id),
    tagNames: inputs.tags.filter((tag) => state.tagIds.includes(tag.id)).map((tag) => tag.name),
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
