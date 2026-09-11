// Score-by-lot comparison (#138, "Ammo performance comparison across lots").
// Pure functions over the same `StatsSeries` the statistics report already
// loads, plus the photo-scoring marks for the group figures.
//
// The point of this module is not the averages — `aggregateByAmmoLot` in
// scoring/stats.ts already computes those. It is saying how much the
// difference between two averages is worth, because a lot fired over 20
// shots and a lot fired over 600 will differ by a point or two from noise
// alone, and a bare table invites the shooter to read that as a result.
//
// So every summary carries its sample size and a 95% confidence interval,
// and the head-to-head returns an explicit `inconclusive`/`insufficient-data`
// verdict rather than a winner.
//
// Two honest caveats, stated here because the UI can only repeat them:
//
//   - Shots within a series are not independent (one bad position, one gust,
//     one flinch moves several at once), so the intervals below are somewhat
//     narrower than the truth. They are a floor on the uncertainty, not a
//     ceiling.
//   - Nothing here controls for *when* a lot was used. A lot fired only
//     during a good month will look good. This compares ammunition and
//     shooter-form together; it cannot separate them.

import { analyzeGroup, type GroupPoint } from '../scoring/group';
import {
  meanTenths,
  sampleStandardDeviationTenths,
  scoredSeries,
  scoredShots,
  seriesMeanTenths,
  volumeShotCount,
  xCount,
  xRate,
  type StatsSeries,
} from '../scoring/stats';

/**
 * The marks of ONE photo-scored series, tagged with the lot it was fired
 * with. Group size is a per-series measure — pooling two sessions' marks
 * into one cloud would measure zeroing drift, not the load.
 */
export interface AmmoLotGroupSample {
  ammoLotId: string;
  seriesId: string;
  points: readonly GroupPoint[];
}

/**
 * How much data a lot brings to the comparison. The 30-shot boundary is a
 * rule of thumb for "the interval has stopped being absurd", not a rule from
 * anywhere — it is used only to label the row and to refuse a head-to-head.
 */
export type AmmoLotSampleBand = 'none' | 'thin' | 'usable';

export const MIN_COMPARABLE_SHOTS = 30;

export interface AmmoLotSummary {
  ammoLotId: string;
  sessionCount: number;
  /** Non-sighter series that carry data. */
  scoredSeriesCount: number;
  scoredShotCount: number;
  /** Every round attributed to the lot, sighters included (spsf-domain rule 2). */
  volumeShotCount: number;
  meanShotTenths: number | null;
  shotSdTenths: number | null;
  /**
   * Half-width of the 95% confidence interval on `meanShotTenths`, in
   * tenths. `null` when fewer than two scored shots.
   */
  meanShotCi95Tenths: number | null;
  /**
   * Mean series total. Comparable across lots only when the series are the
   * same length, which is why the head-to-head uses the per-shot mean.
   */
  meanSeriesTenths: number | null;
  innerTenCount: number;
  innerTenRate: number | null;
  /** Photo-scored series contributing a group measurement. */
  groupSampleCount: number;
  /** Mean extreme spread (group diameter) over those series. */
  meanExtremeSpreadMm: number | null;
  /** Mean of the per-series mean radii — less tail-sensitive than spread. */
  meanRadiusMm: number | null;
  sampleBand: AmmoLotSampleBand;
}

export type AmmoLotVerdict = 'insufficient-data' | 'inconclusive' | 'difference';

export interface AmmoLotHeadToHead {
  leaderLotId: string;
  runnerUpLotId: string;
  /** Leader minus runner-up, per shot, in tenths. Always >= 0. */
  deltaTenths: number;
  /** 95% interval on that difference (Welch). `null` when not computable. */
  ci95LowTenths: number | null;
  ci95HighTenths: number | null;
  verdict: AmmoLotVerdict;
}

export interface AmmoLotComparison {
  /** Best mean first; lots with no scored shots last. Ties break by id. */
  lots: AmmoLotSummary[];
  /** The top two lots that have data, or `null` when fewer than two do. */
  headToHead: AmmoLotHeadToHead | null;
  /**
   * Largest scored-shot count divided by the smallest, over the lots that
   * have any. `null` when fewer than two do.
   */
  sampleImbalance: number | null;
}

/** Above this, the row counts are too lopsided to eyeball the table fairly. */
const IMBALANCE_WARNING_RATIO = 3;

/** True when the lots' shot counts differ enough to mislead a reader. */
export function isSampleImbalanced(comparison: AmmoLotComparison): boolean {
  return (
    comparison.sampleImbalance !== null && comparison.sampleImbalance > IMBALANCE_WARNING_RATIO
  );
}

// --- Student's t ------------------------------------------------------------

// Two-sided 95% critical values for df 1..30. Beyond 30 the value is flat
// enough that two constants cover it; nothing here needs more precision than
// the third decimal, and a table avoids implementing an inverse CDF.
const T95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
  2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048,
  2.045, 2.042,
];

/** Two-sided 95% t critical value for `df` degrees of freedom (df >= 1). */
export function tCritical95(df: number): number {
  const whole = Math.floor(df);
  if (whole <= 0) return T95[0] as number;
  if (whole <= T95.length) return T95[whole - 1] as number;
  if (whole <= 60) return 2.0;
  return 1.96;
}

// --- Per-lot summary ---------------------------------------------------------

function groupFigures(samples: readonly AmmoLotGroupSample[]): {
  groupSampleCount: number;
  meanExtremeSpreadMm: number | null;
  meanRadiusMm: number | null;
} {
  const spreads: number[] = [];
  const radii: number[] = [];
  for (const sample of samples) {
    // A single mark has no spread; measuring one would report 0 mm and read
    // as a perfect group.
    if (sample.points.length < 2) continue;
    const analysis = analyzeGroup(sample.points);
    if (analysis === null) continue;
    spreads.push(analysis.extremeSpreadMm);
    radii.push(analysis.meanRadiusMm);
  }
  const mean = (values: number[]) =>
    values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    groupSampleCount: spreads.length,
    meanExtremeSpreadMm: mean(spreads),
    meanRadiusMm: mean(radii),
  };
}

function band(scoredShotCount: number): AmmoLotSampleBand {
  if (scoredShotCount === 0) return 'none';
  return scoredShotCount < MIN_COMPARABLE_SHOTS ? 'thin' : 'usable';
}

/** Everything the comparison knows about ONE lot's series and marks. */
export function summarizeAmmoLot(
  ammoLotId: string,
  seriesList: readonly StatsSeries[],
  groupSamples: readonly AmmoLotGroupSample[] = [],
): AmmoLotSummary {
  const shots = scoredShots(seriesList);
  const sd = sampleStandardDeviationTenths(shots);

  return {
    ammoLotId,
    sessionCount: new Set(seriesList.map((series) => series.sessionId)).size,
    scoredSeriesCount: scoredSeries(seriesList).filter(
      (series) => series.totalOverride != null || series.shots.length > 0,
    ).length,
    scoredShotCount: shots.length,
    volumeShotCount: volumeShotCount(seriesList),
    meanShotTenths: meanTenths(shots),
    shotSdTenths: sd,
    meanShotCi95Tenths:
      sd === null ? null : (tCritical95(shots.length - 1) * sd) / Math.sqrt(shots.length),
    meanSeriesTenths: seriesMeanTenths(seriesList),
    innerTenCount: xCount(shots),
    innerTenRate: xRate(shots),
    sampleBand: band(shots.length),
    ...groupFigures(groupSamples),
  };
}

// --- Head-to-head ------------------------------------------------------------

/**
 * Welch's comparison of two lots' per-shot means: unequal variances, unequal
 * sizes, no pooling. Returns `insufficient-data` rather than a wide interval
 * when either lot is below `MIN_COMPARABLE_SHOTS` — a "result" from 12 shots
 * is worse than no result, because it gets believed.
 */
export function compareTwoLots(a: AmmoLotSummary, b: AmmoLotSummary): AmmoLotHeadToHead {
  const [leader, runnerUp] =
    (a.meanShotTenths ?? -Infinity) >= (b.meanShotTenths ?? -Infinity) ? [a, b] : [b, a];

  const base: AmmoLotHeadToHead = {
    leaderLotId: leader.ammoLotId,
    runnerUpLotId: runnerUp.ammoLotId,
    deltaTenths: (leader.meanShotTenths ?? 0) - (runnerUp.meanShotTenths ?? 0),
    ci95LowTenths: null,
    ci95HighTenths: null,
    verdict: 'insufficient-data',
  };

  if (leader.shotSdTenths === null || runnerUp.shotSdTenths === null) return base;
  if (
    leader.scoredShotCount < MIN_COMPARABLE_SHOTS ||
    runnerUp.scoredShotCount < MIN_COMPARABLE_SHOTS
  ) {
    return base;
  }

  const varianceOverN = (summary: AmmoLotSummary) =>
    (summary.shotSdTenths as number) ** 2 / summary.scoredShotCount;
  const vLeader = varianceOverN(leader);
  const vRunnerUp = varianceOverN(runnerUp);
  const standardError = Math.sqrt(vLeader + vRunnerUp);

  // Both lots are at or above the minimum, so a zero standard error means
  // both are literally constant — a real (if odd) dataset, and the delta is
  // then exact rather than uncertain.
  if (standardError === 0) {
    return {
      ...base,
      ci95LowTenths: base.deltaTenths,
      ci95HighTenths: base.deltaTenths,
      verdict: base.deltaTenths === 0 ? 'inconclusive' : 'difference',
    };
  }

  // Welch–Satterthwaite degrees of freedom.
  const df =
    (vLeader + vRunnerUp) ** 2 /
    (vLeader ** 2 / (leader.scoredShotCount - 1) + vRunnerUp ** 2 / (runnerUp.scoredShotCount - 1));
  const halfWidth = tCritical95(df) * standardError;
  const low = base.deltaTenths - halfWidth;
  const high = base.deltaTenths + halfWidth;

  return {
    ...base,
    ci95LowTenths: low,
    ci95HighTenths: high,
    // The interval is on leader-minus-runner-up, so it excludes zero exactly
    // when its lower bound is above zero.
    verdict: low > 0 ? 'difference' : 'inconclusive',
  };
}

// --- The whole comparison ----------------------------------------------------

function groupByLot<T>(items: readonly T[], keyOf: (item: T) => string | null | undefined) {
  const byLot = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null || key === undefined) continue;
    const bucket = byLot.get(key) ?? [];
    bucket.push(item);
    byLot.set(key, bucket);
  }
  return byLot;
}

/**
 * Ranks every lot that appears in `seriesList` and compares the top two.
 * Series with no `ammoLotId` are ignored — an unattributed session says
 * nothing about any lot.
 */
export function compareAmmoLots(
  seriesList: readonly StatsSeries[],
  groupSamples: readonly AmmoLotGroupSample[] = [],
): AmmoLotComparison {
  const seriesByLot = groupByLot(seriesList, (series) => series.ammoLotId);
  const samplesByLot = groupByLot(groupSamples, (sample) => sample.ammoLotId);

  const lots = [...seriesByLot.entries()]
    .map(([lotId, list]) => summarizeAmmoLot(lotId, list, samplesByLot.get(lotId) ?? []))
    .sort(
      (a, b) =>
        (b.meanShotTenths ?? -Infinity) - (a.meanShotTenths ?? -Infinity) ||
        a.ammoLotId.localeCompare(b.ammoLotId),
    );

  const withData = lots.filter((lot) => lot.scoredShotCount > 0);
  const counts = withData.map((lot) => lot.scoredShotCount);

  return {
    lots,
    headToHead:
      withData.length >= 2
        ? compareTwoLots(withData[0] as AmmoLotSummary, withData[1] as AmmoLotSummary)
        : null,
    sampleImbalance: counts.length >= 2 ? Math.max(...counts) / Math.min(...counts) : null,
  };
}
