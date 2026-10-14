// Does the sighter go with the competition result? (#573) Executable spec:
// docs/specs/sighter-vs-result-spec.md.
import type { AnalyticsSeries } from './analytics';

/** Fewer qualifying competitions than this and no relation is reported (maintainer, 2026-10-04). */
export const MIN_SIGHTER_COMPETITIONS = 10;

export interface SighterResultPoint {
  sessionId: string;
  startedAt: string;
  sighterMeanShotTenths: number;
  resultMeanShotTenths: number;
}

export type CorrelationStrength = 'none' | 'weak' | 'moderate' | 'strong';

export interface SighterCorrelation {
  r: number;
  strength: CorrelationStrength;
  direction: 'positive' | 'negative' | null;
}

export interface SighterRelation {
  disciplineId: string;
  points: SighterResultPoint[];
  competitionCount: number;
  neededMore: number;
  correlation: SighterCorrelation | null;
}

export function sighterRelation(series: readonly AnalyticsSeries[]): SighterRelation[] {
  const bySession = new Map<string, AnalyticsSeries[]>();
  for (const one of series) {
    if (one.sessionType !== 'competition') continue;
    const bucket = bySession.get(one.sessionId);
    if (bucket) bucket.push(one);
    else bySession.set(one.sessionId, [one]);
  }

  const byDiscipline = new Map<string, SighterResultPoint[]>();
  for (const [sessionId, sessionSeries] of bySession) {
    const sighter = meanShot(sessionSeries.filter((s) => s.isSighter));
    const result = meanShot(
      sessionSeries.filter((s) => !s.isSighter && !s.isFinal && s.isShootOff !== true),
    );
    if (sighter === null || result === null) continue;
    const first = sessionSeries[0]!;
    const point = {
      sessionId,
      startedAt: first.startedAt,
      sighterMeanShotTenths: sighter,
      resultMeanShotTenths: result,
    };
    const points = byDiscipline.get(first.disciplineId);
    if (points) points.push(point);
    else byDiscipline.set(first.disciplineId, [point]);
  }

  const entries: SighterRelation[] = [];
  for (const [disciplineId, points] of byDiscipline) {
    points.sort(
      (a, b) => a.startedAt.localeCompare(b.startedAt) || a.sessionId.localeCompare(b.sessionId),
    );
    const r =
      points.length < MIN_SIGHTER_COMPETITIONS
        ? null
        : pearsonCorrelation(
            points.map((p) => p.sighterMeanShotTenths),
            points.map((p) => p.resultMeanShotTenths),
          );
    entries.push({
      disciplineId,
      points,
      competitionCount: points.length,
      neededMore: Math.max(0, MIN_SIGHTER_COMPETITIONS - points.length),
      correlation: r === null ? null : { r, ...describeCorrelation(r) },
    });
  }

  return entries.sort(
    (a, b) =>
      b.competitionCount - a.competitionCount || a.disciplineId.localeCompare(b.disciplineId),
  );
}

/** Mean per shot over the series' shot rows; `null` when there are none. */
function meanShot(list: readonly AnalyticsSeries[]): number | null {
  const shots = list.flatMap((s) => s.shots);
  if (shots.length === 0) return null;
  return shots.reduce((sum, shot) => sum + shot.valueTenths, 0) / shots.length;
}

/** Pearson's r; `null` when either axis has no variance (r is undefined). */
export function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number | null {
  // Checked on the values, not on the sums below: a flat set of non-integer
  // means can leave a rounding remainder there and yield a meaningless r.
  if (xs.every((x) => x === xs[0]) || ys.every((y) => y === ys[0])) return null;
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Cohen's conventional cut-offs on |r|; a `none` relation has no direction. */
export function describeCorrelation(r: number): Omit<SighterCorrelation, 'r'> {
  const size = Math.abs(r);
  const strength: CorrelationStrength =
    size < 0.1 ? 'none' : size < 0.3 ? 'weak' : size < 0.5 ? 'moderate' : 'strong';
  return {
    strength,
    direction: strength === 'none' ? null : r > 0 ? 'positive' : 'negative',
  };
}
