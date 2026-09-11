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
  seriesAverageTenths,
  seriesInnerTenAverage,
  sessionInnerTenCount,
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
import { getFirearm } from '@/db/queries/firearms';
import { getSession } from '@/db/queries/sessions';
import { listTagsForSession } from '@/db/queries/tags';

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
  /** WebShooter series-level-total granularity (spec Amendment WS1) — no shots exist for this row. */
  isTotalOverride: boolean;
  totalOverrideShotCount: number | null;
}

export interface SessionDetail {
  session: NonNullable<ReturnType<typeof getSession>> | null;
  program: Program | null;
  seriesRows: SeriesRow[];
  results: SessionResults;
  /** Mean of the scored series' totals, in tenths — the header's "snitt/serie". */
  seriesAverageTenths: number | null;
  /** Innertior (centrumtia count) in the scored series (spec A-S7). */
  innerTenCount: number;
  /** Mean innertior per scored series — the card's "snitt X/serie". */
  innerTenAverage: number | null;
  /** Series length used for new series: the program's, else the discipline's. */
  seriesLength: number;
  /**
   * Guld threshold in points for this session's series, or null when the
   * märke rule does not apply. Session-level: `guldserieThreshold` reads
   * only session data plus the series length, so every series of a session
   * shares one value — the series entry screen uses it for a series that
   * does not exist in the database yet.
   */
  guldThreshold: number | null;
  scoringMode: 'integer' | 'decimal';
  /** A section may hold at most one sighter (§6.3). */
  mainHasSighter: boolean;
  finalHasSighter: boolean;
  canStartFinal: boolean;
  /** Skeleton programs pre-create their series; nothing may be appended. */
  isFixedFormat: boolean;
  /** Tag names for the header chips; empty when the session has none. */
  tags: readonly string[];
  /** "Make Model" of the session's firearm, for the header. Null when none is set. */
  firearmName: string | null;
}

const EMPTY: SessionDetail = {
  session: null,
  program: null,
  seriesRows: [],
  results: { beforeFinalTenths: 0, finalTenths: 0, totalTenths: 0, hasFinal: false },
  seriesAverageTenths: null,
  innerTenCount: 0,
  innerTenAverage: null,
  seriesLength: 5,
  guldThreshold: null,
  scoringMode: 'integer',
  mainHasSighter: false,
  finalHasSighter: false,
  canStartFinal: false,
  isFixedFormat: false,
  tags: [],
  firearmName: null,
};

export function loadSessionDetail(sessionId: string): SessionDetail {
  if (!db) return EMPTY;
  const session = getSession(db, sessionId);
  if (!session) return EMPTY;

  const firearm = session.firearmId ? (getFirearm(db, session.firearmId) ?? null) : null;
  const discipline = getDiscipline(session.disciplineId);
  const program = session.programId ? (getProgram(session.programId) ?? null) : null;
  const seriesLength = program?.shotsPerSeries ?? discipline?.defaultSeriesLength ?? 5;
  const birthYear = getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null);
  const year = new Date(session.startedAt).getFullYear();
  const skeleton = program ? buildProgramSkeleton(program).map((e) => e.timeLimitSeconds) : [];
  const guldThreshold = guldserieThreshold({
    weaponGroup: session.weaponGroup,
    disciplineId: session.disciplineId,
    seriesLength,
    birthYear,
    year,
  });

  const seriesRows: SeriesRow[] = listSeriesForSession(db, session.id).map((row) => {
    const shots: EntryShot[] = listShotsForSeries(db, row.id).map((shot) => ({
      valueTenths: shot.valueTenths,
      isInnerTen: shot.isInnerTen === 1,
    }));
    // WS1 (docs/specs/webshooter-app-spec.md): an imported WebShooter series
    // has no shots rows, only a stored total — use it directly rather than
    // summing an array that's always empty for such a row.
    const isTotalOverride = row.isTotalOverride === 1 && row.totalOverrideTenths !== null;
    const totalTenths = isTotalOverride
      ? row.totalOverrideTenths!
      : shots.reduce((sum, shot) => sum + shot.valueTenths, 0);
    const isSighter = row.isSighter === 1;
    return {
      id: row.id,
      position: row.position,
      isSighter,
      isFinal: row.isFinal === 1,
      photoUri: row.photoUri,
      shots,
      totalTenths,
      guldThreshold,
      // Never awarded locally for an override series — no per-shot data to
      // stand behind it; the official standardmedalj badge (§A.5) is the
      // authoritative medal for such a session, shown separately.
      isGuldserie:
        !isTotalOverride &&
        guldThreshold !== null &&
        !isSighter &&
        tenthsToScore(totalTenths) >= guldThreshold,
      timeLimitSeconds: skeleton[row.position - 1] ?? null,
      isTotalOverride,
      totalOverrideShotCount: isTotalOverride ? row.totalOverrideShotCount : null,
    };
  });

  const forResults = seriesRows.map((row) => ({
    isSighter: row.isSighter,
    isFinal: row.isFinal,
    shots: row.shots,
    totalOverride: row.isTotalOverride
      ? { tenths: row.totalTenths, shotCount: row.totalOverrideShotCount ?? 5 }
      : null,
  }));
  const results = sessionResults(forResults);

  return {
    session,
    program,
    seriesRows,
    results,
    seriesAverageTenths: seriesAverageTenths(forResults),
    // A stored counter wins where there are no shot flags to count: a
    // ShotLog import is one total with no `shots` rows, so counting would
    // always answer 0 and silently contradict the number ShotLog gave.
    // Everywhere else it is null and the flags are the truth (schema.ts).
    innerTenCount: session.innerTenCount ?? sessionInnerTenCount(forResults),
    innerTenAverage: seriesInnerTenAverage(forResults),
    seriesLength,
    guldThreshold,
    scoringMode: session.decimalScoring === 1 ? 'decimal' : 'integer',
    mainHasSighter: seriesRows.some((row) => row.isSighter && !row.isFinal),
    finalHasSighter: seriesRows.some((row) => row.isSighter && row.isFinal),
    canStartFinal:
      (program?.supportsFinal ?? false) &&
      !results.hasFinal &&
      seriesRows.some((row) => !row.isSighter && row.shots.length > 0),
    isFixedFormat: program?.structure !== undefined,
    tags: listTagsForSession(db, session.id).map((tag) => tag.name),
    firearmName: firearm ? `${firearm.make} ${firearm.model}` : null,
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
