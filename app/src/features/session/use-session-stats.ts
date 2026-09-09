// Session detail Stats toggle (§4 M5): totals, mean, SD, X count, mini
// distribution, comparison vs the user's last 100 series of the same
// discipline/class, and a standardmedalj line when a threshold is met.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  compareRecentSeries,
  meanTenths,
  sampleStandardDeviationTenths,
  scoredShots,
  seriesInnerTenAverage,
  seriesMeanTenths,
  seriesSdTenths,
  standardmedaljForSession,
  sumValueTenths,
  xCount,
  type CompareRecentSeriesResult,
  type StandardmedaljResult,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listAllStatsSeries } from '@/db/queries/stats';
import { buildDistribution, type DistributionBucket } from '@/features/stats/use-stats-data';

export interface SessionStats {
  /**
   * Per-series figures — the primary reading (maintainer, 2026-09-03: "the
   * stats are per shot. It need to be per series"). `seriesMeanTenths` is
   * the same number as the header card's "Avg/Series"; both come from the
   * mean of the scored series' totals.
   */
  seriesMeanTenths: number | null;
  seriesSdTenths: number | null;
  /**
   * Mean innertior per scored series (maintainer, third review 2026-09-09:
   * "average no of inner tens per series"). Same series set as
   * `seriesMeanTenths`, so the two read as one row.
   */
  seriesInnerTenAverage: number | null;
  seriesCount: number;
  meanTenths: number | null;
  sdTenths: number | null;
  xCount: number;
  /**
   * Sum across the session's scored shots — the aggregate reading shown
   * alongside the per-shot mean/SD/X above (maintainer request: "stats for
   * the sum (all X shots) and per shot"). Same pooled shots as the per-shot
   * figures, so it shares their sighter-exclusion and override-series
   * caveats (see `scoredShots`).
   */
  sumTenths: number;
  shotCount: number;
  distribution: DistributionBucket[];
  comparison: CompareRecentSeriesResult | null;
  standardmedalj: StandardmedaljResult | null;
}

const EMPTY: SessionStats = {
  seriesMeanTenths: null,
  seriesSdTenths: null,
  seriesInnerTenAverage: null,
  seriesCount: 0,
  meanTenths: null,
  sdTenths: null,
  xCount: 0,
  sumTenths: 0,
  shotCount: 0,
  distribution: [],
  comparison: null,
  standardmedalj: null,
};

function loadSessionStats(sessionId: string): SessionStats {
  if (!db || !sessionId) return EMPTY;

  const all = listAllStatsSeries(db);
  const sessionSeries = all.filter((series) => series.sessionId === sessionId);
  if (sessionSeries.length === 0) return EMPTY;

  const scoredNonFinal = sessionSeries.filter((series) => !series.isSighter && !series.isFinal);
  const scoredFinal = sessionSeries.filter((series) => !series.isSighter && series.isFinal);
  const shots = scoredShots(sessionSeries);
  const hasFinal = sessionSeries.some((series) => series.isFinal);

  // WS1 (docs/specs/webshooter-app-spec.md): an override series has no
  // shots rows — use its stored total instead of summing an empty array.
  const seriesTotalTenths = (s: (typeof sessionSeries)[number]) =>
    s.totalOverride ? s.totalOverride.tenths : sumValueTenths(s.shots);
  const beforeFinalTenths = scoredNonFinal.reduce((sum, s) => sum + seriesTotalTenths(s), 0);
  const finalTenths = scoredFinal.reduce((sum, s) => sum + seriesTotalTenths(s), 0);

  const first = sessionSeries[0]!;
  const standardmedalj = standardmedaljForSession({
    disciplineId: first.disciplineId,
    weaponGroup: first.weaponGroup,
    hasFinal,
    beforeFinalSeriesCount: scoredNonFinal.length,
    beforeFinalTenths,
    totalSeriesCount: scoredNonFinal.length + scoredFinal.length,
    totalTenths: beforeFinalTenths + finalTenths,
  });

  const comparison = compareRecentSeries(all, {
    disciplineId: first.disciplineId,
    shooterClass: first.shooterClass,
  });

  return {
    seriesMeanTenths: seriesMeanTenths(sessionSeries),
    seriesSdTenths: seriesSdTenths(sessionSeries),
    seriesInnerTenAverage: seriesInnerTenAverage(sessionSeries),
    seriesCount: scoredNonFinal.length + scoredFinal.length,
    meanTenths: meanTenths(shots),
    sdTenths: sampleStandardDeviationTenths(shots),
    xCount: xCount(shots),
    sumTenths: sumValueTenths(shots),
    shotCount: shots.length,
    distribution: buildDistribution(shots),
    comparison,
    standardmedalj: standardmedalj.valor ? standardmedalj : null,
  };
}

export function useSessionStats(sessionId: string): SessionStats {
  const [stats, setStats] = useState<SessionStats>(() => loadSessionStats(sessionId));

  useFocusEffect(
    useCallback(() => {
      setStats(loadSessionStats(sessionId));
    }, [sessionId]),
  );

  return stats;
}
