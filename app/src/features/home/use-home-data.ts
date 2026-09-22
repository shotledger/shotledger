// Home screen data (§4 M2): total rounds logged + latest 10 sessions, each
// with its score total, per-series average and X count (spec Amendment A2
// §A2.4), plus session/competition counts (maintainer, 2026-09-03). Refetches
// on focus (e.g. after loading demo data from /dev) rather than a true
// live-query — see M2 report for the tradeoff.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { db } from '@/db/client';
import { countVolumeRounds } from '@/db/queries/shots';
import { listAllStatsSeries } from '@/db/queries/stats';
import { listSessions } from '@/db/queries/sessions';
import { faltSessionResult } from '@/db/queries/falt';
import { listTagsBySession } from '@/db/queries/tags';

import { countSessionsByType, type HomeSessionCounts } from './home-session-counts';
import { getDiscipline } from '@shotledger/shared';

import { buildHomeSessionRow, type HomeSessionRow } from './home-session-row';

export type { HomeSessionRow };

export interface HomeData extends HomeSessionCounts {
  /** Volume: every logged shot plus every session's unscored extra rounds. */
  shotsLoggedTotal: number;
  latestSessions: HomeSessionRow[];
}

function loadHomeData(): HomeData {
  if (!db) return { shotsLoggedTotal: 0, sessionCount: 0, competitionCount: 0, latestSessions: [] };

  const allSessions = listSessions(db);
  const sessions = allSessions.slice(0, 10);
  const allSeries = listAllStatsSeries(db);
  const tagsBySession = listTagsBySession(db);
  const latestSessions = sessions.map((session) => {
    // A fält session has no series at all, so its row would otherwise read
    // "0p" forever (found on the emulator, #315).
    const isFalt = getDiscipline(session.disciplineId)?.scoring === 'hits';
    const falt = isFalt ? faltSessionResult(db!, session.id) : null;
    return buildHomeSessionRow(
      session,
      allSeries.filter((series) => series.sessionId === session.id),
      tagsBySession.get(session.id) ?? [],
      falt === null ? null : { hits: falt.hits, figuresHit: falt.figuresHit },
    );
  });

  return {
    shotsLoggedTotal: countVolumeRounds(db),
    ...countSessionsByType(allSessions),
    latestSessions,
  };
}

export function useHomeData(): HomeData & { refresh: () => void } {
  const [data, setData] = useState<HomeData>(() => loadHomeData());

  const refresh = useCallback(() => setData(loadHomeData()), []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { ...data, refresh };
}
