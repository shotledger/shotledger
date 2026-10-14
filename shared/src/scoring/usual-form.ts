// This session against the shooter's usual form (#798). Pure functions over
// the series the session Stats view already loads; the app only draws the
// result. Executable spec: docs/specs/session-vs-usual-form-spec.md.
//
// "Usual form" is the 100 scored series of the same discipline and class shot
// before the session. Per-series figures count an imported stored total (WS1);
// per-shot figures and the shares of 10s and 9-or-better use shot rows only.

import { getDiscipline } from '../disciplines';
import {
  meanTenths,
  sampleStandardDeviationTenths,
  seriesMeanTenths,
  seriesSdTenths,
  type StatsSeries,
  type StatsShot,
} from './stats';

/** How many earlier series make up the baseline. */
export const USUAL_FORM_BASELINE_SIZE = 100;
/** Fewer baseline series than this, and the spread is too rough for a verdict. */
export const USUAL_FORM_MIN_VERDICT_SERIES = 20;

export type UsualFormVerdict = 'clearlyWorse' | 'worse' | 'usual' | 'better' | 'clearlyBetter';

export interface UsualFormSide {
  seriesCount: number;
  shotCount: number;
  seriesMeanTenths: number | null;
  shotMeanTenths: number | null;
  /** Share in [0,1] of shots worth 10.0 or more. `null` for hits, or with no shot rows. */
  tenShare: number | null;
  /** Share in [0,1] of shots worth 9.0 or more. Same `null` rule as `tenShare`. */
  nineOrBetterShare: number | null;
}

export interface UsualFormComparison {
  session: UsualFormSide & { totalTenths: number };
  /** The SDs scale the app's usual/today bars; the series SD also drives the verdict. */
  baseline: UsualFormSide & { seriesSdTenths: number | null; shotSdTenths: number | null };
  /** Each delta is session − baseline; `null` when either side is. */
  deltaSeriesMeanTenths: number | null;
  deltaShotMeanTenths: number | null;
  deltaTenShare: number | null;
  deltaNineOrBetterShare: number | null;
  /** Baseline series mean × the session's series count. */
  expectedTotalTenths: number | null;
  overUnderTenths: number | null;
  /** `null` below `USUAL_FORM_MIN_VERDICT_SERIES` baseline series or with no session series. */
  verdict: UsualFormVerdict | null;
}

export interface UsualFormOptions {
  baselineSize?: number;
}

/**
 * How many standard errors the session's series mean sits from the baseline's:
 * (session − baseline) ÷ (baseline SD ÷ √n). A zero SD gives 0 for no
 * difference and ±Infinity for any, so a flat baseline still yields a verdict.
 */
export function usualFormZ(
  sessionMean: number,
  baselineMean: number,
  baselineSd: number,
  n: number,
): number {
  const difference = sessionMean - baselineMean;
  if (difference === 0) return 0;
  return difference / (baselineSd / Math.sqrt(n));
}

/** The word bands: 1 and 2 standard errors either side. */
export function usualFormVerdict(z: number): UsualFormVerdict {
  if (z >= 2) return 'clearlyBetter';
  if (z >= 1) return 'better';
  if (z <= -2) return 'clearlyWorse';
  if (z <= -1) return 'worse';
  return 'usual';
}

/** One series' total — its stored total (WS1), else the sum of its shots. */
function seriesTotalTenths(series: StatsSeries): number {
  return series.totalOverride
    ? series.totalOverride.tenths
    : series.shots.reduce((sum, shot) => sum + shot.valueTenths, 0);
}

/** Not a sighter or a shoot-off (S2), and carrying data: a shot row or a stored total. */
function isScored(series: StatsSeries): boolean {
  return (
    !series.isSighter &&
    series.isShootOff !== true &&
    (series.totalOverride != null || series.shots.length > 0)
  );
}

function share(shots: readonly StatsShot[], minTenths: number, scoresRings: boolean) {
  if (!scoresRings || shots.length === 0) return null;
  return shots.filter((shot) => shot.valueTenths >= minTenths).length / shots.length;
}

function side(seriesList: readonly StatsSeries[], scoresRings: boolean): UsualFormSide {
  const shots = seriesList.flatMap((series) => series.shots);
  return {
    seriesCount: seriesList.length,
    shotCount: shots.length,
    seriesMeanTenths: seriesMeanTenths(seriesList),
    shotMeanTenths: meanTenths(shots),
    tenShare: share(shots, 100, scoresRings),
    nineOrBetterShare: share(shots, 90, scoresRings),
  };
}

const delta = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);

/**
 * Compares session `sessionId` with the `baselineSize` scored series of the
 * same discipline and class from sessions that started strictly before it.
 * `null` when the input holds no series of that session.
 */
export function compareWithUsualForm(
  seriesList: readonly StatsSeries[],
  sessionId: string,
  options: UsualFormOptions = {},
): UsualFormComparison | null {
  const own = seriesList.filter((series) => series.sessionId === sessionId);
  const first = own[0];
  if (first === undefined) return null;
  const baselineSize = options.baselineSize ?? USUAL_FORM_BASELINE_SIZE;
  const scoresRings = getDiscipline(first.disciplineId)?.scoring !== 'hits';

  const earlier = seriesList
    .filter(
      (series) =>
        isScored(series) &&
        series.disciplineId === first.disciplineId &&
        (series.shooterClass ?? null) === (first.shooterClass ?? null) &&
        series.startedAt < first.startedAt,
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const baselineSeries = earlier.slice(Math.max(0, earlier.length - baselineSize));
  const sessionSeries = own.filter(isScored);

  const session = {
    ...side(sessionSeries, scoresRings),
    totalTenths: sessionSeries.reduce((sum, series) => sum + seriesTotalTenths(series), 0),
  };
  const baseline = {
    ...side(baselineSeries, scoresRings),
    seriesSdTenths: seriesSdTenths(baselineSeries),
    shotSdTenths: sampleStandardDeviationTenths(baselineSeries.flatMap((series) => series.shots)),
  };

  const hasBoth = session.seriesMeanTenths !== null && baseline.seriesMeanTenths !== null;
  const expectedTotalTenths = hasBoth ? baseline.seriesMeanTenths! * session.seriesCount : null;

  let verdict: UsualFormVerdict | null = null;
  if (hasBoth && baseline.seriesCount >= USUAL_FORM_MIN_VERDICT_SERIES) {
    verdict = usualFormVerdict(
      usualFormZ(
        session.seriesMeanTenths!,
        baseline.seriesMeanTenths!,
        baseline.seriesSdTenths!,
        session.seriesCount,
      ),
    );
  }

  return {
    session,
    baseline,
    deltaSeriesMeanTenths: delta(session.seriesMeanTenths, baseline.seriesMeanTenths),
    deltaShotMeanTenths: delta(session.shotMeanTenths, baseline.shotMeanTenths),
    deltaTenShare: delta(session.tenShare, baseline.tenShare),
    deltaNineOrBetterShare: delta(session.nineOrBetterShare, baseline.nineOrBetterShare),
    expectedTotalTenths,
    overUnderTenths: delta(session.totalTenths, expectedTotalTenths),
    verdict,
  };
}
