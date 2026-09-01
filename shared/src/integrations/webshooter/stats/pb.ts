// Personal bests: official (wscli-compatible) and freeform local (spec §6.2,
// §6.3, v2 spec §B.1/§B.5). Pure functions over plain result/session rows —
// no per-shot data exists for imported results (§B.4).

/** One row per competition result — the common input shape (spec §6.1). */
export interface CompetitionResultForStats {
  sessionId: string;
  /** Discipline id, e.g. 'spsf-precision'. */
  competitionType: string;
  /** Federation-scoped weapon group id, e.g. 'spsf:C'. */
  weaponGroup: string;
  /** Shooter class code, e.g. '2'. */
  shooterClass: string;
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

/** Full class string, e.g. `'spsf-precision:spsf:C2'` — group+class, never either alone. */
export function officialPbGroupKey(result: CompetitionResultForStats): string {
  return `${result.competitionType}:${result.weaponGroup}${result.shooterClass}`;
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
  weaponGroup: string;
  shooterClass: string;
  date: string;
  /** Non-sighter, non-final series totals (tenths), any order. */
  seriesTenths: readonly number[];
}

function freeformGroupKey(session: FreeformSessionForPb): string {
  return `${session.disciplineId}:${session.weaponGroup}${session.shooterClass}`;
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

/** Best total regardless of series count (spec §6.3). */
export function bestSession(
  sessions: readonly FreeformSessionForPb[],
): Map<string, BestSeriesResult> {
  const best = new Map<string, BestSeriesResult>();

  for (const session of sessions) {
    const totalTenths = session.seriesTenths.reduce((sum, value) => sum + value, 0);
    const key = freeformGroupKey(session);
    const current = best.get(key);
    if (current === undefined || totalTenths > current.totalTenths) {
      best.set(key, { sessionId: session.sessionId, totalTenths });
    }
  }

  return best;
}
