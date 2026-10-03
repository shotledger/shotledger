// PB & year-to-year screen data (integration spec §B) — computed entirely
// over local data (imported + manual), no network (§B.4).
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  faltPbCoverage,
  faltPersonalBests,
  parseFaltPbGroupKey,
  poangfaltPoints,
  type FaltResultMode,
} from '@shotledger/shared';
import {
  personalBests,
  bestNSeries,
  bestSession,
  officialPbCoverage,
  freeformPbCoverage,
  type PbCoverage,
} from '@shotledger/shared/src/integrations/webshooter/stats/pb';
import {
  yearStats,
  yearsWithData,
  yearOverYearChange,
  twoPointTrend,
  type YearStat,
} from '@shotledger/shared/src/integrations/webshooter/stats/yearOverYear';

import { db } from '@/db/client';
import { listSessions } from '@/db/queries/sessions';
import { listFaltAnalyticsSessions } from '@/db/queries/stats';
import {
  countAllSessions,
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

export interface FaltPbRow {
  groupKey: string;
  disciplineId: string;
  weaponGroupId: string | null;
  mode: FaltResultMode;
  stationCount: number;
  sessionId: string;
  sessionName: string;
  startedAt: string;
  hits: number;
  figuresHit: number;
  /** The poängfält sum — what a poängfält row shows. */
  points: number;
}

export interface YoYGroupRow {
  groupKey: string;
  years: YearStat[];
  latestChange: { absoluteTenths: number; percentage: number } | null;
  trendPerYear: number | null;
}

export interface WebshooterRecordsData {
  officialPbs: OfficialPbRow[];
  freeformPbs: FreeformPbRow[];
  yearOverYear: YoYGroupRow[];
  /** What each section was computed from — never optional (#318). */
  officialCoverage: PbCoverage;
  freeformCoverage: PbCoverage;
  faltPbs: FaltPbRow[];
  faltCoverage: PbCoverage;
}

const NO_COVERAGE: PbCoverage = { considered: 0, counted: 0, ungrouped: 0 };

function computeRecords(): WebshooterRecordsData {
  if (!db) {
    return {
      officialPbs: [],
      freeformPbs: [],
      yearOverYear: [],
      officialCoverage: NO_COVERAGE,
      freeformCoverage: NO_COVERAGE,
      faltPbs: [],
      faltCoverage: NO_COVERAGE,
    };
  }

  const competitionResults = listCompetitionResultsForStats(db);
  const freeformSessions = listFreeformSessionsForPb(db);
  const totalSessions = countAllSessions(db);

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

  const faltSessions = listFaltAnalyticsSessions(db);
  const nameById = new Map(listSessions(db).map((session) => [session.id, session.name] as const));
  const faltPbs: FaltPbRow[] = [...faltPersonalBests(faltSessions)]
    .map(([groupKey, pb]) => ({
      groupKey,
      ...parseFaltPbGroupKey(groupKey),
      sessionId: pb.sessionId,
      sessionName: nameById.get(pb.sessionId) ?? pb.sessionId,
      startedAt: pb.startedAt,
      hits: pb.result.hits,
      figuresHit: pb.result.figuresHit,
      points: poangfaltPoints(pb.result),
    }))
    .sort((a, b) => a.groupKey.localeCompare(b.groupKey));

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

  return {
    officialPbs,
    freeformPbs,
    yearOverYear,
    officialCoverage: officialPbCoverage(competitionResults),
    freeformCoverage: freeformPbCoverage(freeformSessions, totalSessions),
    faltPbs,
    faltCoverage: faltPbCoverage(faltSessions, totalSessions),
  };
}

export function useWebshooterRecords(): WebshooterRecordsData {
  const [data, setData] = useState<WebshooterRecordsData>(() => computeRecords());

  useFocusEffect(
    useCallback(() => {
      setData(computeRecords());
    }, []),
  );

  return data;
}
