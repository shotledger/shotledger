// Statistics engine for M5 (§4 M5, live views — never a form). Pure
// functions over plain data; all money-analogue precision is value_tenths
// (§3), matching totals.ts/marke.ts. Executable spec:
// docs/specs/m5-stats-spec.md §"Behaviors — stats.ts".
//
// Sighter series are excluded from every score statistic but included in
// volume metrics (spsf-domain rule 2) — every function below documents
// which side of that line it's on. Rule 2 is scoped to a *session*: outside
// one a sighter is an ordinary series, which callers ask for with
// `SighterScope` (docs/specs/sighters-in-statistics-spec.md).

import { goldSeriesThreshold } from './badges';
import { tenthsToScore } from './totals';
import { volumeOfSeries } from './volume';

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
   * Webshooter series-level-total granularity (spec Amendment WS1,
   * docs/specs/webshooter-app-spec.md): set only for an imported series
   * with no shot rows. `shots` is always `[]` when this is set. Included
   * in series-level metrics (bestWorstSeries, volume); every per-shot
   * metric (mean/SD/X%/trend/guldserie) naturally excludes it since there
   * is no shot data to pool.
   */
  totalOverride?: { tenths: number; shotCount: number } | null;
  /**
   * A total-only series with no stored shot count (a ShotLog import) has no
   * `totalOverride`, so every score statistic leaves it out; volume counts it
   * as this — its discipline's series length (`totalOnlyShotCount`).
   */
  volumeOnlyShotCount?: number | null;
  /** The program stage the series belongs to (helmatch delmoment); absent for most. */
  stage?: string | null;
}

// --- Low-level tenths math -----------------------------------------------
//
// The mean/SD pair is shared by the per-shot and per-series metrics: the
// only difference between them is what goes into the array (one shot's
// value, or one whole series' total).

/** Arithmetic mean of a tenths array. `null` for an empty set (undefined, not 0). */
function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

/** Sample standard deviation (n-1 denominator) of a tenths array. `null` when n<2. */
function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values) as number;
  const sumSquaredDeviation = values.reduce((acc, value) => acc + (value - average) ** 2, 0);
  return Math.sqrt(sumSquaredDeviation / (values.length - 1));
}

/** Arithmetic mean of value_tenths. `null` for an empty set (undefined, not 0). */
export function meanTenths(shots: readonly StatsShot[]): number | null {
  return mean(shots.map((shot) => shot.valueTenths));
}

/** Sample standard deviation (n-1 denominator) of value_tenths. `null` when n<2. */
export function sampleStandardDeviationTenths(shots: readonly StatsShot[]): number | null {
  return sampleStandardDeviation(shots.map((shot) => shot.valueTenths));
}

/**
 * Centrumtia count — `is_inner_ten`, which since Amendment A1 (§A1.1) means
 * the shooter pressed `(X)`. A plain `X` is an ordinary ten and is not counted.
 * UI labels this "(X)" / "inner tens" / sv "innertior", never bare "X".
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

export interface SighterScope {
  /**
   * The cross-session scope: a sighter is an ordinary series (maintainer,
   * 2026-09-16 — "in the global statistics sighters and normal series are
   * the same"). Defaults to `false`, the in-session scope, so an
   * unqualified call keeps spsf-domain rule 2.
   */
  includeSighters?: boolean;
}

/** The series a score statistic is computed over, per `scope`. */
export function scoredSeries(
  seriesList: readonly StatsSeries[],
  scope: SighterScope = {},
): StatsSeries[] {
  return scope.includeSighters ? [...seriesList] : seriesList.filter((series) => !series.isSighter);
}

/** The pooled shots of `scoredSeries` — the input to session/period score means. */
export function scoredShots(
  seriesList: readonly StatsSeries[],
  scope: SighterScope = {},
): StatsShot[] {
  return scoredSeries(seriesList, scope).flatMap((series) => series.shots);
}

/**
 * Volume metric: every shot including sighter series (spsf-domain rule 2).
 * A total-only series contributes its shot count (`volumeOfSeries`) instead
 * of `shots.length` (always 0 for such a series).
 */
export function volumeShotCount(seriesList: readonly StatsSeries[]): number {
  return seriesList.reduce((count, series) => count + volumeOfSeries(series), 0);
}

// --- Per-series score math ---------------------------------------------------
//
// The primary reading on the session Stats tab (maintainer, 2026-09-03: "the
// stats are per shot. It need to be per series, e.g. avg is 45.24 for 5
// rounds"). Same sighter exclusion as every score statistic; an override
// series (WS1) counts here because a series total is exactly what it stores.

/** One series' total in tenths — its stored override (WS1), else the sum of its shots. */
function seriesTotalTenths(series: StatsSeries): number {
  return series.totalOverride
    ? series.totalOverride.tenths
    : series.shots.reduce((sum, shot) => sum + shot.valueTenths, 0);
}

/**
 * Totals of the scored series that actually carry data, in tenths. A series
 * with no shots entered yet is omitted rather than counted as 0, so adding
 * an empty series never drags the mean down — the same rule
 * `seriesAverageTenths` (totals.ts) applies to the session header, kept in
 * lock-step with it so the Stats tab and the result card agree.
 */
export function scoredSeriesTotalsTenths(seriesList: readonly StatsSeries[]): number[] {
  return scoredSeries(seriesList)
    .filter((series) => series.totalOverride != null || series.shots.length > 0)
    .map(seriesTotalTenths);
}

/** Mean series total in tenths. `null` when no scored series carries data. */
export function seriesMeanTenths(seriesList: readonly StatsSeries[]): number | null {
  return mean(scoredSeriesTotalsTenths(seriesList));
}

/** Sample standard deviation (n-1) of the series totals. `null` when fewer than 2. */
export function seriesSdTenths(seriesList: readonly StatsSeries[]): number | null {
  return sampleStandardDeviation(scoredSeriesTotalsTenths(seriesList));
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
    .map((series) => ({ id: series.id, totalTenths: seriesTotalTenths(series) }));

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

// --- Guldserie count ---------------------------------------------------------

export interface GoldSeriesCountOptions {
  birthYear?: number | null;
}

/**
 * Count of series meeting the guld märke requirement, reusing
 * marke.ts (which already restricts to spsf-precision 5-shot series with a
 * mapped vapengrupp — never re-implemented here). Each series' calendar
 * year is taken from its own `startedAt` so age reduction is correct
 * across a multi-year period filter.
 *
 * Takes no `SighterScope` because a **sighter always counts towards a
 * guldserie** (maintainer, 2026-09-17): a 50 on a provserie earns the märke
 * like any other series, in or out of a session, whatever the Statistics
 * tab's filter says.
 */
export function goldSeriesCount(
  seriesList: readonly StatsSeries[],
  options: GoldSeriesCountOptions = {},
): number {
  let count = 0;
  for (const series of seriesList) {
    const year = new Date(series.startedAt).getUTCFullYear();
    const threshold = goldSeriesThreshold({
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
  goldSeriesCount: number;
}

function aggregateBy(
  seriesList: readonly StatsSeries[],
  keyFn: (series: StatsSeries) => string | null | undefined,
  options: GoldSeriesCountOptions,
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
      goldSeriesCount: goldSeriesCount(bucketSeries, options),
    };
  });
}

/** Per-firearm aggregate. Series with `firearmId` unset are excluded. */
export function aggregateByFirearm(
  seriesList: readonly StatsSeries[],
  options: GoldSeriesCountOptions = {},
): StatsAggregateBucket[] {
  return aggregateBy(seriesList, (series) => series.firearmId, options);
}

/** Per-ammo-lot aggregate. Series with `ammoLotId` unset are excluded. */
export function aggregateByAmmoLot(
  seriesList: readonly StatsSeries[],
  options: GoldSeriesCountOptions = {},
): StatsAggregateBucket[] {
  return aggregateBy(seriesList, (series) => series.ammoLotId, options);
}
