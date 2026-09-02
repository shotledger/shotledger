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
  standardmedaljForSession,
  xCount,
  type CompareRecentSeriesResult,
  type StandardmedaljResult,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listAllStatsSeries } from '@/db/queries/stats';
import { buildDistribution, type DistributionBucket } from '@/features/stats/use-stats-data';

export interface SessionStats {
  meanTenths: number | null;
  sdTenths: number | null;
  xCount: number;
  distribution: DistributionBucket[];
  comparison: CompareRecentSeriesResult | null;
  standardmedalj: StandardmedaljResult | null;
}

const EMPTY: SessionStats = {
  meanTenths: null,
  sdTenths: null,
  xCount: 0,
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

  const beforeFinalTenths = scoredNonFinal.flatMap((s) => s.shots).reduce((sum, s) => sum + s.valueTenths, 0);
  const finalTenths = scoredFinal.flatMap((s) => s.shots).reduce((sum, s) => sum + s.valueTenths, 0);

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
    meanTenths: meanTenths(shots),
    sdTenths: sampleStandardDeviationTenths(shots),
    xCount: xCount(shots),
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
