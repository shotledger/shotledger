// Filter + aggregation engine behind the Statistics tab's generated report
// (filter form -> report, replacing M5's always-live view). Pure functions
// over plain arrays; the app assembles the input from SQLite.
// Executable spec: docs/specs/analytics-report-spec.md, amended by
// docs/specs/sighters-in-statistics-spec.md — the two aggregations take a
// `SighterScope`, since outside a session a sighter is an ordinary series
// unless the user filters it out. Volume is scope-free either way.
//
// Deliberately federation-agnostic: every filter dimension is a plain
// column the DB already stores, so the report works for any discipline or
// federation, not only SPSF.

import {
  meanTenths,
  scoredSeries,
  volumeShotCount,
  type SighterScope,
  type StatsSeries,
} from './stats';

/**
 * A ten is any shot worth 10.0 or more. Integer scoring stores exactly 100;
 * decimal scoring stores 100-109, and rounding those to points would count
 * a 10.9 as an eleven. Generic ring-scoring rule, not an SPSF one.
 */
const TEN_TENTHS = 100;

export type AnalyticsSessionType = 'training' | 'competition';

/** A `StatsSeries` plus the two session-level fields the report filters on. */
export interface AnalyticsSeries extends StatsSeries {
  sessionType: AnalyticsSessionType;
  /** Tag ids of the owning session, denormalized onto each of its series. */
  tagIds: readonly string[];
}

export interface AnalyticsFilter {
  /** Inclusive ISO-8601 bounds on `startedAt`; `null` = unbounded. */
  fromIso: string | null;
  toIso: string | null;
  sessionType: AnalyticsSessionType | null;
  disciplineId: string | null;
  shotsPerSeries: number | null;
  /** OR-match ("any of these tags"); empty = no tag filter. */
  tagIds: readonly string[];
}

/** The filter that keeps everything — the report screen's starting point. */
export const ANY_ANALYTICS_FILTER: AnalyticsFilter = {
  fromIso: null,
  toIso: null,
  sessionType: null,
  disciplineId: null,
  shotsPerSeries: null,
  tagIds: [],
};

/**
 * Shots actually fired in one series. An imported Webshooter series (WS1)
 * has no shot rows, only a stored count — so it is still filterable by
 * length.
 */
function firedShotCount(series: StatsSeries): number {
  return series.totalOverride?.shotCount ?? series.shots.length;
}

/** A series that carries a score (override total or real shots), per `scope`. */
function isScoredSeries(series: StatsSeries, scope: SighterScope): boolean {
  return (
    (scope.includeSighters === true || !series.isSighter) &&
    (series.totalOverride != null || series.shots.length > 0)
  );
}

function seriesTotalTenths(series: StatsSeries): number {
  return series.totalOverride
    ? series.totalOverride.tenths
    : series.shots.reduce((sum, shot) => sum + shot.valueTenths, 0);
}

// --- Filtering ---------------------------------------------------------------

/**
 * Applies the report filter. Predicates compose with AND across fields; an
 * unset field is a no-op. Sighter series are kept — filtering is about
 * membership, and the aggregations below apply the sighter rule themselves.
 */
export function filterAnalyticsSeries(
  list: readonly AnalyticsSeries[],
  filter: AnalyticsFilter,
): AnalyticsSeries[] {
  return list.filter((series) => {
    if (filter.fromIso !== null && series.startedAt < filter.fromIso) return false;
    if (filter.toIso !== null && series.startedAt > filter.toIso) return false;
    if (filter.sessionType !== null && series.sessionType !== filter.sessionType) return false;
    if (filter.disciplineId !== null && series.disciplineId !== filter.disciplineId) return false;
    if (filter.shotsPerSeries !== null && firedShotCount(series) !== filter.shotsPerSeries) {
      return false;
    }
    if (filter.tagIds.length > 0 && !filter.tagIds.some((id) => series.tagIds.includes(id))) {
      return false;
    }
    return true;
  });
}

// --- The report's session set ------------------------------------------------

/**
 * A session as the report sees it, independent of whether it has series.
 *
 * The report is otherwise built entirely from series rows, which makes a
 * session with none invisible to it — not counted, and its `extra_rounds`
 * missing from the volume. That is not an accident of the data: a
 * `kind: 'rounds'` session is defined as one that logs its shots in
 * `extra_rounds` and never gets series (#349).
 */
export interface AnalyticsSession {
  id: string;
  startedAt: string;
  sessionType: AnalyticsSessionType;
  disciplineId: string;
  tagIds: readonly string[];
  /** Unscored extra rounds on the session (spec A1 §A1.3); 0 when unset. */
  extraRounds: number;
}

/**
 * The session-level half of the report filter. `shotsPerSeries` is a question
 * about series and is deliberately not applied here — a session that has no
 * series cannot answer it, and excluding it on that basis is the variant the
 * maintainer rejected (#349).
 */
export function filterAnalyticsSessions(
  list: readonly AnalyticsSession[],
  filter: AnalyticsFilter,
): AnalyticsSession[] {
  return list.filter((session) => {
    if (filter.fromIso !== null && session.startedAt < filter.fromIso) return false;
    if (filter.toIso !== null && session.startedAt > filter.toIso) return false;
    if (filter.sessionType !== null && session.sessionType !== filter.sessionType) return false;
    if (filter.disciplineId !== null && session.disciplineId !== filter.disciplineId) return false;
    if (filter.tagIds.length > 0 && !filter.tagIds.some((id) => session.tagIds.includes(id))) {
      return false;
    }
    return true;
  });
}

/**
 * The sessions the report covers: those with at least one matching series,
 * plus those that have no series at all and pass the session-level filter.
 *
 * A session that HAS series answers the series-shaped questions through them,
 * so one whose every series was filtered out is out of the report too — that
 * is the pre-#349 behaviour and it was never wrong. What was wrong is that a
 * session with nothing to filter fell through the same hole.
 */
export function analyticsReportSessions(
  sessions: readonly AnalyticsSession[],
  allSeries: readonly AnalyticsSeries[],
  matchedSeries: readonly AnalyticsSeries[],
  filter: AnalyticsFilter,
): AnalyticsSession[] {
  const withAnySeries = new Set(allSeries.map((series) => series.sessionId));
  const matchedIds = new Set(matchedSeries.map((series) => series.sessionId));
  const seriesFree = new Set(
    filterAnalyticsSessions(
      sessions.filter((session) => !withAnySeries.has(session.id)),
      filter,
    ).map((session) => session.id),
  );

  return sessions
    .filter((session) => matchedIds.has(session.id) || seriesFree.has(session.id))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
}

// --- Per-session points (the x-axis of every chart) --------------------------

export interface AnalyticsSessionPoint {
  sessionId: string;
  startedAt: string;
  scoredSeriesCount: number;
  scoredShotCount: number;
  sessionTotalTenths: number;
  /** `sessionTotalTenths / scoredSeriesCount`; `null` when nothing scored. */
  meanSeriesTotalTenths: number | null;
  /** Mean of the session's non-sighter shots; `null` when there are none. */
  meanShotTenths: number | null;
  innerTenCount: number;
  tenCount: number;
}

/**
 * One point per session, chronological. Ties on `startedAt` are broken by
 * `sessionId` so the ordering is total and the charts are deterministic.
 */
export function analyticsSessionPoints(
  list: readonly AnalyticsSeries[],
  scope: SighterScope = {},
): AnalyticsSessionPoint[] {
  const bySession = new Map<string, AnalyticsSeries[]>();
  for (const series of list) {
    const bucket = bySession.get(series.sessionId) ?? [];
    bucket.push(series);
    bySession.set(series.sessionId, bucket);
  }

  const points: AnalyticsSessionPoint[] = [];
  for (const [sessionId, sessionSeries] of bySession) {
    const scored = sessionSeries.filter((series) => isScoredSeries(series, scope));
    const shots = scoredSeries(sessionSeries, scope).flatMap((series) => series.shots);
    const sessionTotalTenths = scored.reduce((sum, s) => sum + seriesTotalTenths(s), 0);

    points.push({
      sessionId,
      startedAt: sessionSeries[0]!.startedAt,
      scoredSeriesCount: scored.length,
      scoredShotCount: shots.length,
      sessionTotalTenths,
      meanSeriesTotalTenths: scored.length === 0 ? null : sessionTotalTenths / scored.length,
      meanShotTenths: meanTenths(shots),
      innerTenCount: shots.filter((shot) => shot.isInnerTen).length,
      tenCount: shots.filter((shot) => shot.valueTenths >= TEN_TENTHS).length,
    });
  }

  return points.sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.sessionId.localeCompare(b.sessionId),
  );
}

// --- Records within the filtered set ----------------------------------------

export interface AnalyticsRecord {
  sessionId: string;
  startedAt: string;
  value: number;
}

export interface AnalyticsRecords {
  bestSessionTotalTenths: AnalyticsRecord | null;
  mostInnerTens: AnalyticsRecord | null;
  mostTens: AnalyticsRecord | null;
}

/** Maximum of `pick` over `candidates`; ties keep the first (earliest). */
function maxRecord(
  candidates: readonly AnalyticsSessionPoint[],
  pick: (point: AnalyticsSessionPoint) => number,
): AnalyticsRecord | null {
  let best: AnalyticsRecord | null = null;
  for (const point of candidates) {
    const value = pick(point);
    if (best === null || value > best.value) {
      best = { sessionId: point.sessionId, startedAt: point.startedAt, value };
    }
  }
  return best;
}

/**
 * The three records the report's Summary card shows. `null` means no
 * session in the filtered set qualifies — the UI says so rather than
 * printing a zero it cannot explain.
 */
export function analyticsRecords(points: readonly AnalyticsSessionPoint[]): AnalyticsRecords {
  const withSeries = points.filter((point) => point.scoredSeriesCount > 0);
  const withShots = points.filter((point) => point.scoredShotCount > 0);

  return {
    bestSessionTotalTenths: maxRecord(withSeries, (point) => point.sessionTotalTenths),
    mostInnerTens: maxRecord(withShots, (point) => point.innerTenCount),
    mostTens: maxRecord(withShots, (point) => point.tenCount),
  };
}

// --- Totals: the sum half and the per-shot half ------------------------------

export interface AnalyticsTotals {
  sessionCount: number;
  scoredSeriesCount: number;
  /** Every shot fired, sighters and imported counts included. */
  volumeShotCount: number;
  scoredShotCount: number;
  /** Sum of the scored series' totals — the "all x shots" figure. */
  sumTenths: number;
  meanShotTenths: number | null;
  meanSeriesTenths: number | null;
  innerTenCount: number;
  tenCount: number;
}

/** Aggregate over the whole filtered set — both the sums and the per-shot means. */
export function analyticsTotals(
  list: readonly AnalyticsSeries[],
  scope: SighterScope = {},
): AnalyticsTotals {
  const scored = list.filter((series) => isScoredSeries(series, scope));
  const shots = scoredSeries(list, scope).flatMap((series) => series.shots);
  const sumTenths = scored.reduce((sum, series) => sum + seriesTotalTenths(series), 0);

  return {
    sessionCount: new Set(list.map((series) => series.sessionId)).size,
    scoredSeriesCount: scored.length,
    volumeShotCount: volumeShotCount(list),
    scoredShotCount: shots.length,
    sumTenths,
    meanShotTenths: meanTenths(shots),
    meanSeriesTenths: scored.length === 0 ? null : sumTenths / scored.length,
    innerTenCount: shots.filter((shot) => shot.isInnerTen).length,
    tenCount: shots.filter((shot) => shot.valueTenths >= TEN_TENTHS).length,
  };
}

/**
 * `analyticsTotals` seen from the report's session set rather than from the
 * series alone. Only the two fields that are answers about *sessions* change;
 * everything else is delegated, so there is one implementation of each.
 */
export function analyticsReportTotals(
  matchedSeries: readonly AnalyticsSeries[],
  reportSessions: readonly AnalyticsSession[],
  scope: SighterScope = {},
): AnalyticsTotals {
  const totals = analyticsTotals(matchedSeries, scope);
  return {
    ...totals,
    sessionCount: reportSessions.length,
    volumeShotCount:
      totals.volumeShotCount +
      reportSessions.reduce((sum, session) => sum + session.extraRounds, 0),
  };
}
