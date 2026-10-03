// Personal bests: official (wscli-compatible) and freeform local (spec §6.2,
// §6.3, v2 spec §B.1/§B.5). Pure functions over plain result/session rows —
// no per-shot data exists for imported results (§B.4).

import { ranksAhead } from '../../../scoring/stages';

/** One row per competition result — the common input shape (spec §6.1). */
export interface CompetitionResultForStats {
  sessionId: string;
  /** Discipline id, e.g. 'spsf-precision'. */
  competitionType: string;
  /**
   * Federation-scoped weapon group id, e.g. 'spsf:C'. `null` where the
   * shooter never recorded one — those results group under `UNGROUPED_KEY`
   * rather than being dropped (#318).
   */
  weaponGroup: string | null;
  /**
   * Shooter class code, e.g. '2'. Display only — no function here reads it.
   * `null` where unknown, which is every session from a source that did not
   * record a klass (ShotLog, and so most imported history).
   */
  shooterClass: string | null;
  /** ISO date of the competition. */
  date: string;
  beforeFinalTenths: number;
  beforeFinalSeriesCount: number;
  /** Equals beforeFinalTenths when the discipline has no final (milsnabb). */
  totalTenths: number;
  totalSeriesCount: number;
  /** Tie-break input (spec §6.2, VERIFY: wscli's exact term/definition). */
  figureHits: number;
  innerTens: number;
}

const PRECISION_PB_SERIES_COUNT = 7;
const MILSNABB_PB_SERIES_COUNT = 12; // VERIFY: spec §6.2 / v2 spec §B.1

/**
 * Official-competition PB eligibility (spec §6.2): precision needs exactly
 * 7 grundomgång series (finals excluded from both eligibility and score);
 * milsnabb needs exactly 12 series (its whole result — no final section).
 */
export function isOfficialPbEligible(result: CompetitionResultForStats): boolean {
  if (result.competitionType === 'spsf-precision') {
    return result.beforeFinalSeriesCount === PRECISION_PB_SERIES_COUNT;
  }
  if (result.competitionType === 'spsf-milsnabb') {
    return result.totalSeriesCount === MILSNABB_PB_SERIES_COUNT;
  }
  return false;
}

/** The eligibility-gated score: grundomgång for precision, whole total for milsnabb. */
export function officialPbScore(result: CompetitionResultForStats): number {
  return result.competitionType === 'spsf-precision'
    ? result.beforeFinalTenths
    : result.totalTenths;
}

/**
 * The weapon-group segment of a group key for a result that has no vapengrupp.
 * A distinct bucket, never a silent drop: a best computed from sessions whose
 * group is unknown is still that shooter's best, and 142 of 267 sessions in
 * the maintainer's real history are this case (#318).
 */
export const UNGROUPED_KEY = '';

/**
 * Discipline + vapengrupp, e.g. `'spsf-precision:spsf:C'`.
 *
 * Klass is deliberately NOT part of it (maintainer, 2026-09-15: "We only show
 * person best per weapon group. Class does not matter."). A shooter who moved
 * from klass 2 to klass 3 has one best per gun, not one per gun per klass —
 * and the year-over-year key has always grouped this way.
 */
export function officialPbGroupKey(result: CompetitionResultForStats): string {
  return `${result.competitionType}:${result.weaponGroup ?? UNGROUPED_KEY}`;
}

export interface PersonalBestGroup {
  allTime: CompetitionResultForStats | null;
  byYear: Map<number, CompetitionResultForStats>;
}

/**
 * `a` (the incoming candidate) beats `b` (the current best) strictly — a
 * complete tie on score/figureHits/innerTens keeps `b`, the first-seen
 * result, same tie-stability convention as `bestWorstSeries` in
 * shared/src/scoring/stats.ts.
 */
function isBetterOfficialPb(a: CompetitionResultForStats, b: CompetitionResultForStats): boolean {
  const scoreA = officialPbScore(a);
  const scoreB = officialPbScore(b);
  if (scoreA !== scoreB) return scoreA > scoreB;
  if (a.figureHits !== b.figureHits) return a.figureHits > b.figureHits;
  return a.innerTens > b.innerTens;
}

/**
 * Official (wscli-compatible) PBs, grouped by (competitionType, full
 * weaponClass). Ranked descending by score, ties broken by figureHits then
 * innerTens (spec §6.2). Both an all-time and a per-year PB are maintained.
 */
export function personalBests(
  results: readonly CompetitionResultForStats[],
): Map<string, PersonalBestGroup> {
  const groups = new Map<string, PersonalBestGroup>();

  for (const result of results) {
    if (!isOfficialPbEligible(result)) continue;
    const key = officialPbGroupKey(result);
    const group = groups.get(key) ?? {
      allTime: null,
      byYear: new Map<number, CompetitionResultForStats>(),
    };

    if (group.allTime === null || isBetterOfficialPb(result, group.allTime)) group.allTime = result;

    const year = new Date(result.date).getUTCFullYear();
    const currentYearBest = group.byYear.get(year);
    if (currentYearBest === undefined || isBetterOfficialPb(result, currentYearBest)) {
      group.byYear.set(year, result);
    }

    groups.set(key, group);
  }

  return groups;
}

// --- §6.3 freeform local PBs (spec's own deviation from wscli, §B.5) -------------

export interface FreeformSessionForPb {
  sessionId: string;
  disciplineId: string;
  /** `null` groups under `UNGROUPED_KEY` — see `CompetitionResultForStats`. */
  weaponGroup: string | null;
  /** Display only; see `CompetitionResultForStats.shooterClass`. */
  shooterClass: string | null;
  date: string;
  /** Non-sighter, non-final series totals (tenths), any order. */
  seriesTenths: readonly number[];
  /** What breaks a tie on the total — helmatch's C then B (`tieBreakTenths`). */
  tieBreakTenths?: readonly number[];
}

/** Same shape and the same klass-free rule as `officialPbGroupKey`. */
function freeformGroupKey(session: FreeformSessionForPb): string {
  return `${session.disciplineId}:${session.weaponGroup ?? UNGROUPED_KEY}`;
}

export interface BestSeriesResult {
  sessionId: string;
  totalTenths: number;
}

/**
 * Best N-series (spec §6.3): for each session with at least N series, sums
 * the N highest-scoring series (not required to be consecutive — a freeform
 * session has no fixed order to be consecutive within). Keeps the best such
 * sum per group. A group with no session meeting `n` is simply absent from
 * the returned map (never zero-padded).
 */
export function bestNSeries(
  sessions: readonly FreeformSessionForPb[],
  n: number,
): Map<string, BestSeriesResult> {
  const best = new Map<string, BestSeriesResult>();

  for (const session of sessions) {
    if (session.seriesTenths.length < n) continue;
    const topN = [...session.seriesTenths].sort((a, b) => b - a).slice(0, n);
    const totalTenths = topN.reduce((sum, value) => sum + value, 0);
    const key = freeformGroupKey(session);
    const current = best.get(key);
    if (current === undefined || totalTenths > current.totalTenths) {
      best.set(key, { sessionId: session.sessionId, totalTenths });
    }
  }

  return best;
}

/**
 * Best total regardless of series count (spec §6.3). A tie goes by the
 * session's tie-break keys (helmatch: C, then B), else to the first seen.
 */
export function bestSession(
  sessions: readonly FreeformSessionForPb[],
): Map<string, BestSeriesResult> {
  const best = new Map<string, BestSeriesResult>();

  const keys = new Map<string, readonly number[]>();
  for (const session of sessions) {
    const totalTenths = session.seriesTenths.reduce((sum, value) => sum + value, 0);
    const tieBreakTenths = session.tieBreakTenths ?? [];
    const key = freeformGroupKey(session);
    const current = best.get(key);
    if (
      current === undefined ||
      ranksAhead({ totalTenths, tieBreakTenths }, { ...current, tieBreakTenths: keys.get(key)! })
    ) {
      best.set(key, { sessionId: session.sessionId, totalTenths });
      keys.set(key, tieBreakTenths);
    }
  }

  return best;
}

export interface StatsGroup {
  /** Discipline id, e.g. 'spsf-precision'. */
  disciplineId: string;
  /** Federation-scoped vapengrupp id, e.g. 'spsf:C'. */
  weaponGroupId: string;
}

/**
 * Splits a group key back into its two halves, so a screen can render written
 * -out names instead of the raw key (#138: "This is not for humans").
 *
 * Split on the FIRST colon only: the vapengrupp id carries one of its own.
 */
export function parseStatsGroupKey(key: string): StatsGroup {
  const at = key.indexOf(':');
  if (at < 0) return { disciplineId: key, weaponGroupId: '' };
  return { disciplineId: key.slice(0, at), weaponGroupId: key.slice(at + 1) };
}

// --- Coverage (#318) ------------------------------------------------------

/**
 * What a records figure was computed from.
 *
 * A personal best is a *claim*. An empty Records screen is honest and
 * obviously incomplete; a populated one computed from a fraction of the data
 * is neither, and the shooter has no way to tell. So every figure the screen
 * shows must be able to say what it is the best *of* — which means the counts
 * travel with the records rather than being recoverable only by rerunning the
 * query.
 */
export interface PbCoverage {
  /** Sessions offered to the computation. */
  considered: number;
  /** Sessions that could actually produce a record. */
  counted: number;
  /** Of `counted`, how many carry no vapengrupp and so land in `UNGROUPED_KEY`. */
  ungrouped: number;
}

/** Coverage of the official-PB path: eligibility is series count, not klass. */
export function officialPbCoverage(results: readonly CompetitionResultForStats[]): PbCoverage {
  const eligible = results.filter(isOfficialPbEligible);
  return {
    considered: results.length,
    counted: eligible.length,
    ungrouped: eligible.filter((r) => !r.weaponGroup).length,
  };
}

/** Coverage of the freeform path: a session counts if it has a scored series. */
export function freeformPbCoverage(
  sessions: readonly FreeformSessionForPb[],
  consideredSessionCount: number,
): PbCoverage {
  const counted = sessions.filter((s) => s.seriesTenths.length > 0);
  return {
    considered: consideredSessionCount,
    counted: counted.length,
    ungrouped: counted.filter((s) => !s.weaponGroup).length,
  };
}
