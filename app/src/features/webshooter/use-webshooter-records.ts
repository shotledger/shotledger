// PB & year-to-year screen data (integration spec §B) — computed entirely
// over local data (imported + manual), no network (§B.4).
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  personalBests,
  bestNSeries,
  bestSession,
} from '@shotledger/shared/src/integrations/webshooter/stats/pb';
import {
  yearStats,
  yearsWithData,
  yearOverYearChange,
  twoPointTrend,
  type YearStat,
} from '@shotledger/shared/src/integrations/webshooter/stats/yearOverYear';

import { db } from '@/db/client';
import {
  listCompetitionResultsForStats,
  listFreeformSessionsForPb,
} from '@/db/queries/webshooter-stats';

export interface OfficialPbRow {
  groupKey: string;
  allTimeTenths: number | null;
  yearTenths: Map<number, number>;
}

export interface FreeformPbRow {
  groupKey: string;
  best5Tenths: number | null;
  best10Tenths: number | null;
  bestSessionTenths: number | null;
}

export interface YoYGroupRow {
  groupKey: string;
  years: YearStat[];
  latestChange: { absoluteTenths: number; percentage: number } | null;
  trendPerYear: number | null;
}

export interface WebShooterRecordsData {
  officialPbs: OfficialPbRow[];
  freeformPbs: FreeformPbRow[];
  yearOverYear: YoYGroupRow[];
}

function computeRecords(): WebShooterRecordsData {
  if (!db) return { officialPbs: [], freeformPbs: [], yearOverYear: [] };

  const competitionResults = listCompetitionResultsForStats(db);
  const freeformSessions = listFreeformSessionsForPb(db);

  const pbMap = personalBests(competitionResults);
  const officialPbs: OfficialPbRow[] = [...pbMap.entries()].map(([groupKey, group]) => ({
    groupKey,
    allTimeTenths: group.allTime?.beforeFinalTenths ?? null,
    yearTenths: new Map(
      [...group.byYear.entries()].map(([year, r]) => [year, r.beforeFinalTenths]),
    ),
  }));

  const best5 = bestNSeries(freeformSessions, 5);
  const best10 = bestNSeries(freeformSessions, 10);
  const bestOverall = bestSession(freeformSessions);
  const freeformGroupKeys = new Set([...best5.keys(), ...best10.keys(), ...bestOverall.keys()]);
  const freeformPbs: FreeformPbRow[] = [...freeformGroupKeys].map((groupKey) => ({
    groupKey,
    best5Tenths: best5.get(groupKey)?.totalTenths ?? null,
    best10Tenths: best10.get(groupKey)?.totalTenths ?? null,
    bestSessionTenths: bestOverall.get(groupKey)?.totalTenths ?? null,
  }));

  const yoyMap = yearStats(competitionResults);
  const yearOverYear: YoYGroupRow[] = [...yoyMap.entries()].map(([groupKey, byYear]) => {
    const years = yearsWithData(byYear)
      .sort((a, b) => a - b)
      .map((y) => byYear.get(y)!);
    const latest = years[years.length - 1] ?? null;
    const previous = years.length >= 2 ? years[years.length - 2]! : null;
    return {
      groupKey,
      years,
      latestChange: latest ? yearOverYearChange(latest, previous) : null,
      trendPerYear: twoPointTrend(years)?.slopePerYear ?? null,
    };
  });

  return { officialPbs, freeformPbs, yearOverYear };
}

export function useWebShooterRecords(): WebShooterRecordsData {
  const [data, setData] = useState<WebShooterRecordsData>(() => computeRecords());

  useFocusEffect(
    useCallback(() => {
      setData(computeRecords());
    }, []),
  );

  return data;
}
