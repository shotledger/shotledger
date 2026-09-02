// M5 (§4 M5): live statistics for the /stats tab. Refetches on focus, like
// Home and session detail (§4 M2/M3 — no true reactive live-query yet).
// All math delegates to @shotledger/shared's stats.ts; this file only does
// period/filter slicing and DB access.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  bestWorstSeries,
  compareRecentSeries,
  guldserieCount,
  meanTenths,
  sampleStandardDeviationTenths,
  scoredShots,
  sessionTrend,
  tenthsToScore,
  volumeShotCount,
  xRate,
  type SessionTrendPoint,
  type StatsSeries,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listFirearms } from '@/db/queries/firearms';
import { getSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { sumExtraRounds } from '@/db/queries/sessions';
import { listAllStatsSeries } from '@/db/queries/stats';

export const STATS_PERIODS = ['30d', '6m', '12m', 'all', 'custom'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export interface StatsFilters {
  period: StatsPeriod;
  disciplineId: string | null;
  shooterClass: string | null;
  firearmId: string | null;
  /** 'YYYY-MM-DD', only meaningful when period === 'custom'. */
  customFrom: string | null;
  customTo: string | null;
}

export const DEFAULT_STATS_FILTERS: StatsFilters = {
  period: '6m',
  disciplineId: null,
  shooterClass: null,
  firearmId: null,
  customFrom: null,
  customTo: null,
};

export interface DistributionBucket {
  /** Ring value in points (0-10); X shots count under 10. */
  value: number;
  count: number;
}

export interface FilterOption {
  id: string;
  label: string;
}

export interface StatsData {
  hasAnyData: boolean;
  hasFilteredData: boolean;
  totalShots: number;
  sessionCount: number;
  meanTenths: number | null;
  sdTenths: number | null;
  xRatePercent: number | null;
  guldserieCountInPeriod: number;
  bestSeriesTenths: number | null;
  worstSeriesTenths: number | null;
  trend: SessionTrendPoint[];
  distribution: DistributionBucket[];
  /** Ids only — the screen localizes discipline/class labels via i18n. */
  disciplineIds: string[];
  shooterClasses: string[];
  firearmOptions: FilterOption[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<StatsPeriod, 'all' | 'custom'>, number> = {
  '30d': 30,
  '6m': 182,
  '12m': 365,
};

export interface PeriodRange {
  fromIso: string | null;
  toIso: string | null;
}

/** The [from, to] ISO range a period filter resolves to; both null = all time. */
export function periodRange(filters: StatsFilters): PeriodRange {
  if (filters.period === 'all') return { fromIso: null, toIso: null };
  if (filters.period === 'custom') {
    return {
      fromIso: filters.customFrom ? `${filters.customFrom}T00:00:00.000Z` : null,
      toIso: filters.customTo ? `${filters.customTo}T23:59:59.999Z` : null,
    };
  }
  return {
    fromIso: new Date(Date.now() - PERIOD_DAYS[filters.period] * DAY_MS).toISOString(),
    toIso: null,
  };
}

function inPeriod(seriesList: readonly StatsSeries[], range: PeriodRange): StatsSeries[] {
  return seriesList.filter(
    (series) =>
      (range.fromIso === null || series.startedAt >= range.fromIso) &&
      (range.toIso === null || series.startedAt <= range.toIso),
  );
}

function uniqueSorted(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

/** Exported for reuse by the session-detail mini distribution (§4 M5). */
export function buildDistribution(
  shots: readonly { valueTenths: number; isInnerTen: boolean }[],
): DistributionBucket[] {
  const counts = new Map<number, number>();
  for (const shot of shots) {
    const points = Math.round(tenthsToScore(shot.valueTenths));
    counts.set(points, (counts.get(points) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));
}

function loadStatsData(filters: StatsFilters): StatsData {
  if (!db) {
    return {
      hasAnyData: false,
      hasFilteredData: false,
      totalShots: 0,
      sessionCount: 0,
      meanTenths: null,
      sdTenths: null,
      xRatePercent: null,
      guldserieCountInPeriod: 0,
      bestSeriesTenths: null,
      worstSeriesTenths: null,
      trend: [],
      distribution: [],
      disciplineIds: [],
      shooterClasses: [],
      firearmOptions: [],
    };
  }

  const all = listAllStatsSeries(db);
  const periodSeries = inPeriod(all, periodRange(filters));

  const filtered = periodSeries.filter(
    (series) =>
      (filters.disciplineId === null || series.disciplineId === filters.disciplineId) &&
      (filters.shooterClass === null || series.shooterClass === filters.shooterClass) &&
      (filters.firearmId === null || series.firearmId === filters.firearmId),
  );

  const shots = scoredShots(filtered);
  const birthYear = getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null);
  const { best, worst } = bestWorstSeries(filtered);

  const firearmNames = new Map(
    listFirearms(db).map((firearm) => [firearm.id, `${firearm.make} ${firearm.model}`.trim()]),
  );

  return {
    hasAnyData: all.length > 0,
    hasFilteredData: filtered.length > 0,
    // Volume, so unscored extra rounds count too (spec A1 §A1.3 A-X3); every
    // score statistic below is computed from `shots`/`filtered` and so cannot
    // see them (A-X4).
    totalShots:
      volumeShotCount(filtered) +
      sumExtraRounds(db, [...new Set(filtered.map((series) => series.sessionId))]),
    sessionCount: new Set(filtered.map((series) => series.sessionId)).size,
    meanTenths: meanTenths(shots),
    sdTenths: sampleStandardDeviationTenths(shots),
    xRatePercent: (() => {
      const rate = xRate(shots);
      return rate === null ? null : rate * 100;
    })(),
    guldserieCountInPeriod: guldserieCount(filtered, { birthYear }),
    bestSeriesTenths: best?.totalTenths ?? null,
    worstSeriesTenths: worst?.totalTenths ?? null,
    trend: sessionTrend(filtered),
    distribution: buildDistribution(shots),
    disciplineIds: uniqueSorted(periodSeries.map((series) => series.disciplineId)),
    shooterClasses: uniqueSorted(periodSeries.map((series) => series.shooterClass)),
    firearmOptions: uniqueSorted(periodSeries.map((series) => series.firearmId)).map((id) => ({
      id,
      label: firearmNames.get(id) ?? id,
    })),
  };
}

/** Comparison of the most recent 100 series vs the 100 before that, same discipline+class. */
export function loadComparisonForSession(disciplineId: string, shooterClass: string | null) {
  if (!db) return null;
  const all = listAllStatsSeries(db);
  return compareRecentSeries(all, { disciplineId, shooterClass });
}

export function useStatsData(filters: StatsFilters): { data: StatsData; refresh: () => void } {
  const [data, setData] = useState<StatsData>(() => loadStatsData(filters));

  const refresh = useCallback(() => setData(loadStatsData(filters)), [filters]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      filters.period,
      filters.disciplineId,
      filters.shooterClass,
      filters.firearmId,
      filters.customFrom,
      filters.customTo,
    ]),
  );

  return { data, refresh };
}
