// Per-stage (delmoment) figures for the session detail screen (#730).
import { seriesAverageTenths, stageSubtotals, type SeriesForResults } from '@shotledger/shared';

export interface StagedSeries extends SeriesForResults {
  stage: string | null;
  totalTenths: number;
}

export interface StageStats {
  stage: string;
  totalTenths: number;
  /** Scored series with a result — the ones the average is taken over. */
  seriesCount: number;
  averageTenths: number | null;
}

/**
 * One entry per program stage, in order; empty for a program without stages.
 * Total, count and average follow the session-wide figures, so sighters never
 * count and a series not yet shot is not averaged in.
 */
export function stageStats(
  stages: readonly string[],
  series: readonly StagedSeries[],
): StageStats[] {
  return stageSubtotals(stages, series).map(({ stage, totalTenths }) => {
    const inStage = series.filter((entry) => entry.stage === stage);
    return {
      stage,
      totalTenths,
      seriesCount: inStage.filter((entry) => seriesAverageTenths([entry]) !== null).length,
      averageTenths: seriesAverageTenths(inStage),
    };
  });
}
