// Training vs competition, like for like (#570). Executable spec:
// docs/specs/session-type-comparison-spec.md.
import type { AnalyticsSeries, AnalyticsSessionType } from './analytics';
import { meanTenths, scoredSeries, xCount, type SighterScope } from './stats';

export interface SessionTypeSide {
  sessionCount: number;
  seriesCount: number;
  meanSeriesTenths: number;
  medianSeriesTenths: number;
  bestSeriesTenths: number;
  /** Sample SD of the series totals; `null` below two series. */
  seriesSdTenths: number | null;
  /** Over shot rows only; `null` when the side has none (imported totals). */
  meanShotTenths: number | null;
  /** X count over the series with shot rows; `null` when none have any. */
  innerTensPerSeries: number | null;
}

export interface SessionTypeComparison {
  disciplineId: string;
  seriesLength: number;
  training: SessionTypeSide;
  competition: SessionTypeSide;
  /** Competition mean minus training mean, per series. Negative = competition lower. */
  gapSeriesTenths: number;
}

export function compareSessionTypes(
  series: readonly AnalyticsSeries[],
  scope: SighterScope = {},
): SessionTypeComparison[] {
  const groups = new Map<string, { key: GroupKey; series: AnalyticsSeries[] }>();
  for (const one of scoredSeries(series, scope) as AnalyticsSeries[]) {
    const length = seriesLength(one);
    if (length === 0) continue;
    const id = `${one.disciplineId}\u0000${length}`;
    const group = groups.get(id);
    if (group) group.series.push(one);
    else
      groups.set(id, {
        key: { disciplineId: one.disciplineId, seriesLength: length },
        series: [one],
      });
  }

  const rows: SessionTypeComparison[] = [];
  for (const { key, series: members } of groups.values()) {
    const training = side(members, 'training');
    const competition = side(members, 'competition');
    if (!training || !competition) continue;
    rows.push({
      ...key,
      training,
      competition,
      gapSeriesTenths: competition.meanSeriesTenths - training.meanSeriesTenths,
    });
  }

  return rows.sort(
    (a, b) =>
      b.training.seriesCount +
        b.competition.seriesCount -
        (a.training.seriesCount + a.competition.seriesCount) ||
      a.disciplineId.localeCompare(b.disciplineId) ||
      a.seriesLength - b.seriesLength,
  );
}

interface GroupKey {
  disciplineId: string;
  seriesLength: number;
}

/** Shots in the series: its rows, or the count an imported total carries. */
function seriesLength(series: AnalyticsSeries): number {
  return series.totalOverride ? series.totalOverride.shotCount : series.shots.length;
}

function seriesTotalTenths(series: AnalyticsSeries): number {
  return series.totalOverride
    ? series.totalOverride.tenths
    : series.shots.reduce((sum, shot) => sum + shot.valueTenths, 0);
}

function side(
  members: readonly AnalyticsSeries[],
  sessionType: AnalyticsSessionType,
): SessionTypeSide | null {
  const own = members.filter((series) => series.sessionType === sessionType);
  if (own.length === 0) return null;

  const totals = own.map(seriesTotalTenths);
  const withShots = own.filter((series) => series.shots.length > 0);
  const shots = withShots.flatMap((series) => series.shots);
  const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;

  return {
    sessionCount: new Set(own.map((series) => series.sessionId)).size,
    seriesCount: own.length,
    meanSeriesTenths: mean,
    medianSeriesTenths: median(totals),
    bestSeriesTenths: Math.max(...totals),
    seriesSdTenths:
      totals.length < 2
        ? null
        : Math.sqrt(
            totals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (totals.length - 1),
          ),
    meanShotTenths: meanTenths(shots),
    innerTensPerSeries: withShots.length === 0 ? null : xCount(shots) / withShots.length,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
