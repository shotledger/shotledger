// Session detail data (§4 M3): the series list with per-shot chips, the
// derived beforeFinal/final/total results (§6.3), and the guldserie
// threshold for each series (§6.5). Refetches on focus, like Home.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  buildProgramSkeleton,
  getDiscipline,
  getProgram,
  guldserieThreshold,
  sessionResults,
  tenthsToScore,
  type EntryShot,
  type Program,
  type SessionResults,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { getSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { listSeriesForSession } from '@/db/queries/series';
import { listShotsForSeries } from '@/db/queries/shots';
import { getSession } from '@/db/queries/sessions';

export interface SeriesRow {
  id: string;
  position: number;
  isSighter: boolean;
  isFinal: boolean;
  photoUri: string | null;
  shots: EntryShot[];
  totalTenths: number;
  /** Guld threshold in points, or null when the märke rule does not apply. */
  guldThreshold: number | null;
  isGuldserie: boolean;
  timeLimitSeconds: number | null;
}

export interface SessionDetail {
  session: NonNullable<ReturnType<typeof getSession>> | null;
  program: Program | null;
  seriesRows: SeriesRow[];
  results: SessionResults;
  /** Series length used for new series: the program's, else the discipline's. */
  seriesLength: number;
  scoringMode: 'integer' | 'decimal';
  /** A section may hold at most one sighter (§6.3). */
  mainHasSighter: boolean;
  finalHasSighter: boolean;
  canStartFinal: boolean;
  /** Skeleton programs pre-create their series; nothing may be appended. */
  isFixedFormat: boolean;
}

const EMPTY: SessionDetail = {
  session: null,
  program: null,
  seriesRows: [],
  results: { beforeFinalTenths: 0, finalTenths: 0, totalTenths: 0, hasFinal: false },
  seriesLength: 5,
  scoringMode: 'integer',
  mainHasSighter: false,
  finalHasSighter: false,
  canStartFinal: false,
  isFixedFormat: false,
};

export function loadSessionDetail(sessionId: string): SessionDetail {
  if (!db) return EMPTY;
  const session = getSession(db, sessionId);
  if (!session) return EMPTY;

  const discipline = getDiscipline(session.disciplineId);
  const program = session.programId ? (getProgram(session.programId) ?? null) : null;
  const seriesLength = program?.shotsPerSeries ?? discipline?.defaultSeriesLength ?? 5;
  const birthYear = getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null);
  const year = new Date(session.startedAt).getFullYear();
  const skeleton = program ? buildProgramSkeleton(program).map((e) => e.timeLimitSeconds) : [];

  const seriesRows: SeriesRow[] = listSeriesForSession(db, session.id).map((row) => {
    const shots: EntryShot[] = listShotsForSeries(db, row.id).map((shot) => ({
      valueTenths: shot.valueTenths,
      isInnerTen: shot.isInnerTen === 1,
      isInnerTenDecimal: shot.isInnerTenDecimal === 1,
    }));
    const totalTenths = shots.reduce((sum, shot) => sum + shot.valueTenths, 0);
    const threshold = guldserieThreshold({
      weaponGroup: session.weaponGroup,
      disciplineId: session.disciplineId,
      seriesLength,
      birthYear,
      year,
    });
    const isSighter = row.isSighter === 1;
    return {
      id: row.id,
      position: row.position,
      isSighter,
      isFinal: row.isFinal === 1,
      photoUri: row.photoUri,
      shots,
      totalTenths,
      guldThreshold: threshold,
      isGuldserie: threshold !== null && !isSighter && tenthsToScore(totalTenths) >= threshold,
      timeLimitSeconds: skeleton[row.position - 1] ?? null,
    };
  });

  const results = sessionResults(
    seriesRows.map((row) => ({ isSighter: row.isSighter, isFinal: row.isFinal, shots: row.shots })),
  );

  return {
    session,
    program,
    seriesRows,
    results,
    seriesLength,
    scoringMode: session.decimalScoring === 1 ? 'decimal' : 'integer',
    mainHasSighter: seriesRows.some((row) => row.isSighter && !row.isFinal),
    finalHasSighter: seriesRows.some((row) => row.isSighter && row.isFinal),
    canStartFinal:
      (program?.supportsFinal ?? false) &&
      !results.hasFinal &&
      seriesRows.some((row) => !row.isSighter && row.shots.length > 0),
    isFixedFormat: program?.structure !== undefined,
  };
}

export function useSessionDetail(sessionId: string): {
  detail: SessionDetail;
  refresh: () => void;
} {
  const [detail, setDetail] = useState<SessionDetail>(() => loadSessionDetail(sessionId));

  const refresh = useCallback(() => setDetail(loadSessionDetail(sessionId)), [sessionId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { detail, refresh };
}
