// Statistics engine for M5 (§4 M5, live views — never a form). Pure
// functions over plain data; all money-analogue precision is value_tenths
// (§3), matching totals.ts/marke.ts. Executable spec:
// docs/specs/m5-stats-spec.md §"Behaviors — stats.ts".
//
// Sighter series are excluded from every score statistic but included in
// volume metrics (spsf-domain rule 2) — every function below documents
// which side of that line it's on.

import { guldserieThreshold } from './marke';
import { tenthsToScore } from './totals';

export interface StatsShot {
  valueTenths: number;
  isInnerTen: boolean;
}

export interface StatsSeries {
  id: string;
  sessionId: string;
  /** ISO 8601. */
  startedAt: string;
  disciplineId: string;
  weaponGroup?: string | null;
  shooterClass?: string | null;
  firearmId?: string | null;
  ammoLotId?: string | null;
  isSighter: boolean;
  isFinal: boolean;
  shots: readonly StatsShot[];
  /**
   * WebShooter series-level-total granularity (spec Amendment WS1,
   * docs/specs/webshooter-app-spec.md): set only for an imported series
   * with no shot rows. `shots` is always `[]` when this is set. Included
   * in series-level metrics (bestWorstSeries, volume); every per-shot
   * metric (mean/SD/X%/trend/guldserie) naturally excludes it since there
   * is no shot data to pool.
   */
  totalOverride?: { tenths: number; shotCount: number } | null;
}

// --- Low-level shot math -------------------------------------------------

/** Arithmetic mean of value_tenths. `null` for an empty set (undefined, not 0). */
export function meanTenths(shots: readonly StatsShot[]): number | null {
  if (shots.length === 0) return null;
  const sum = shots.reduce((acc, shot) => acc + shot.valueTenths, 0);
  return sum / shots.length;
}

/** Sample standard deviation (n-1 denominator) of value_tenths. `null` when n<2. */
export function sampleStandardDeviationTenths(shots: readonly StatsShot[]): number | null {
  if (shots.length < 2) return null;
  const mean = meanTenths(shots) as number;
  const sumSquaredDeviation = shots.reduce((acc, shot) => acc + (shot.valueTenths - mean) ** 2, 0);
  return Math.sqrt(sumSquaredDeviation / (shots.length - 1));
}

/**
 * Centrumtia count — `is_inner_ten`, which since Amendment A1 (§A1.1) means
 * the shooter pressed `(X)`. A plain `X` is an ordinary ten and is not counted.
 * UI labels this "(X)" / "inner tens" / sv "centrumtior", never bare "X".
 */
export function xCount(shots: readonly StatsShot[]): number {
  return shots.filter((shot) => shot.isInnerTen).length;
}

/** Centrumtia rate in [0,1]. `null` for an empty set. */
export function xRate(shots: readonly StatsShot[]): number | null {
  if (shots.length === 0) return null;
  return xCount(shots) / shots.length;
}

// --- Sighter split ---------------------------------------------------------

/** Non-sighter series only — the input to every score statistic. */
export function scoredSeries(seriesList: readonly StatsSeries[]): StatsSeries[] {
  return seriesList.filter((series) => !series.isSighter);
}

/** All non-sighter shots, pooled — the input to session/period score means. */
export function scoredShots(seriesList: readonly StatsSeries[]): StatsShot[] {
  return scoredSeries(seriesList).flatMap((series) => series.shots);
}

/**
 * Volume metric: every shot including sighter series (spsf-domain rule 2).
 * An override series (WS1) contributes its stored shot count instead of
 * `shots.length` (always 0 for such a series).
 */
export function volumeShotCount(seriesList: readonly StatsSeries[]): number {
  return seriesList.reduce(
    (count, series) => count + (series.totalOverride?.shotCount ?? series.shots.length),
    0,
  );
}

// --- Best / worst series ----------------------------------------------------

export interface SeriesTotal {
  id: string;
  totalTenths: number;
}

export interface BestWorstSeries {
  best: SeriesTotal | null;
  worst: SeriesTotal | null;
}

/**
 * Highest/lowest-scoring non-sighter series by total. Ties keep the first
 * occurrence in input order (documented, not undefined behavior). An
 * override series (WS1) is included using its stored total — this is a
 * series-level metric, so it works without per-shot detail.
 */
export function bestWorstSeries(seriesList: readonly StatsSeries[]): BestWorstSeries {
  const totals = scoredSeries(seriesList)
    .filter((series) => series.totalOverride != null || series.shots.length > 0)
    .map((series) => ({
      id: series.id,
      totalTenths: series.totalOverride
        ? series.totalOverride.tenths
        : series.shots.reduce((sum, shot) => sum + shot.valueTenths, 0),
    }));

  if (totals.length === 0) return { best: null, worst: null };

  let best = totals[0]!;
  let worst = totals[0]!;
  for (const total of totals) {
    if (total.totalTenths > best.totalTenths) best = total;
    if (total.totalTenths < worst.totalTenths) worst = total;
  }
  return { best, worst };
}

// --- Rolling per-session trend ----------------------------------------------

export interface SessionTrendPoint {
  sessionId: string;
  startedAt: string;
  meanTenths: number;
}

/**
 * One point per session (chronological, ascending `startedAt`): the mean
 * value of that session's non-sighter shots. A session with no scored
 * shots (only sighters, or empty) is omitted rather than plotted as 0/NaN.
 */
export function sessionTrend(seriesList: readonly StatsSeries[]): SessionTrendPoint[] {
  const bySession = new Map<string, { startedAt: string; shots: StatsShot[] }>();
  for (const series of scoredSeries(seriesList)) {
    const entry = bySession.get(series.sessionId) ?? { startedAt: series.startedAt, shots: [] };
    entry.shots.push(...series.shots);
    bySession.set(series.sessionId, entry);
  }

  const points: SessionTrendPoint[] = [];
  for (const [sessionId, entry] of bySession) {
    const mean = meanTenths(entry.shots);
    if (mean === null) continue;
    points.push({ sessionId, startedAt: entry.startedAt, meanTenths: mean });
  }

  return points.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

// --- Recent-vs-previous comparison ------------------------------------------

export interface CompareTarget {
  disciplineId: string;
  shooterClass?: string | null;
}

export interface CompareRecentSeriesResult {
  recentMeanTenths: number | null;
  previousMeanTenths: number | null;
  deltaTenths: number | null;
  recentCount: number;
  previousCount: number;
}

const DEFAULT_COMPARE_N = 100;

/**
 * Compares the last N scored series of a discipline+class against the N
 * before that, both pooled at shot level (§4 M5). Series are matched by
 * `disciplineId` and `shooterClass`, sorted chronologically by
 * `startedAt`. Fewer than N previous series never fabricates a baseline —
 * `previousMeanTenths`/`deltaTenths` are `null` when there is nothing to
 * compare against.
 */
export function compareRecentSeries(
  seriesList: readonly StatsSeries[],
  target: CompareTarget,
  n: number = DEFAULT_COMPARE_N,
): CompareRecentSeriesResult {
  const matching = scoredSeries(seriesList)
    .filter(
      (series) =>
        series.disciplineId === target.disciplineId && series.shooterClass === target.shooterClass,
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const recent = matching.slice(Math.max(0, matching.length - n));
  const previous = matching.slice(
    Math.max(0, matching.length - 2 * n),
    Math.max(0, matching.length - n),
  );

  const recentMeanTenths = meanTenths(recent.flatMap((series) => series.shots));
  const previousMeanTenths = meanTenths(previous.flatMap((series) => series.shots));

  return {
    recentMeanTenths,
    previousMeanTenths,
    deltaTenths:
      recentMeanTenths !== null && previousMeanTenths !== null
        ? recentMeanTenths - previousMeanTenths
        : null,
    recentCount: recent.length,
    previousCount: previous.length,
  };
}

// --- Guldserie count ---------------------------------------------------------

export interface GuldserieCountOptions {
  birthYear?: number | null;
}

/**
 * Count of non-sighter series meeting the guld märke requirement, reusing
 * marke.ts (which already restricts to spsf-precision 5-shot series with a
 * mapped vapengrupp — never re-implemented here). Each series' calendar
 * year is taken from its own `startedAt` so age reduction is correct
 * across a multi-year period filter.
 */
export function guldserieCount(
  seriesList: readonly StatsSeries[],
  options: GuldserieCountOptions = {},
): number {
  let count = 0;
  for (const series of scoredSeries(seriesList)) {
    const year = new Date(series.startedAt).getUTCFullYear();
    const threshold = guldserieThreshold({
      weaponGroup: series.weaponGroup,
      disciplineId: series.disciplineId,
      seriesLength: series.shots.length,
      birthYear: options.birthYear,
      year,
    });
    if (threshold === null) continue;
    const points = tenthsToScore(series.shots.reduce((sum, shot) => sum + shot.valueTenths, 0));
    if (points >= threshold) count += 1;
  }
  return count;
}

// --- Per-firearm / per-ammo-lot aggregates ----------------------------------

export interface StatsAggregateBucket {
  key: string;
  volumeShotCount: number;
  scoredShotCount: number;
  meanTenths: number | null;
  sdTenths: number | null;
  xCount: number;
  xRate: number | null;
  sessionCount: number;
  guldserieCount: number;
}

function aggregateBy(
  seriesList: readonly StatsSeries[],
  keyFn: (series: StatsSeries) => string | null | undefined,
  options: GuldserieCountOptions,
): StatsAggregateBucket[] {
  const byKey = new Map<string, StatsSeries[]>();
  for (const series of seriesList) {
    const key = keyFn(series);
    if (key === null || key === undefined) continue;
    const bucket = byKey.get(key) ?? [];
    bucket.push(series);
    byKey.set(key, bucket);
  }

  return [...byKey.entries()].map(([key, bucketSeries]) => {
    const shots = scoredShots(bucketSeries);
    return {
      key,
      volumeShotCount: volumeShotCount(bucketSeries),
      scoredShotCount: shots.length,
      meanTenths: meanTenths(shots),
      sdTenths: sampleStandardDeviationTenths(shots),
      xCount: xCount(shots),
      xRate: xRate(shots),
      sessionCount: new Set(bucketSeries.map((series) => series.sessionId)).size,
      guldserieCount: guldserieCount(bucketSeries, options),
    };
  });
}

/** Per-firearm aggregate. Series with `firearmId` unset are excluded. */
export function aggregateByFirearm(
  seriesList: readonly StatsSeries[],
  options: GuldserieCountOptions = {},
): StatsAggregateBucket[] {
  return aggregateBy(seriesList, (series) => series.firearmId, options);
}

/** Per-ammo-lot aggregate. Series with `ammoLotId` unset are excluded. */
export function aggregateByAmmoLot(
  seriesList: readonly StatsSeries[],
  options: GuldserieCountOptions = {},
): StatsAggregateBucket[] {
  return aggregateBy(seriesList, (series) => series.ammoLotId, options);
}
