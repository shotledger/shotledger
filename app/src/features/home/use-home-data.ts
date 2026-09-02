// Home screen data (§4 M2): total rounds logged + latest 10 sessions, each
// with its score total, per-series average and X count (spec Amendment A2
// §A2.4). Refetches on focus (e.g. after loading demo data from /dev) rather
// than a true live-query — see M2 report for the tradeoff.
import {
  seriesAverageTenths,
  sessionInnerTenCount,
  sumValueTenths,
  tenthsToScore,
} from '@shotledger/shared';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { db } from '@/db/client';
import { countVolumeRounds, listScoredShotsForSession } from '@/db/queries/shots';
import { listAllStatsSeries } from '@/db/queries/stats';
import { listSessions } from '@/db/queries/sessions';

export interface HomeSessionRow {
  id: string;
  name: string;
  type: 'training' | 'competition';
  startedAt: string;
  total: number;
  /** Mean of the session's scored series, in display points. `null` when none. */
  seriesAverage: number | null;
  /** Centrumtior in the session's scored series. */
  innerTenCount: number;
}

export interface HomeData {
  /** Volume: every logged shot plus every session's unscored extra rounds. */
  shotsLoggedTotal: number;
  latestSessions: HomeSessionRow[];
}

function loadHomeData(): HomeData {
  if (!db) return { shotsLoggedTotal: 0, latestSessions: [] };

  const sessions = listSessions(db).slice(0, 10);
  const allSeries = listAllStatsSeries(db);
  const latestSessions = sessions.map((session) => {
    const sessionSeries = allSeries.filter((series) => series.sessionId === session.id);
    const average = seriesAverageTenths(sessionSeries);
    return {
      id: session.id,
      name: session.name,
      type: session.type,
      startedAt: session.startedAt,
      total: tenthsToScore(sumValueTenths(listScoredShotsForSession(db, session.id))),
      seriesAverage: average === null ? null : tenthsToScore(average),
      innerTenCount: sessionInnerTenCount(sessionSeries),
    };
  });

  return { shotsLoggedTotal: countVolumeRounds(db), latestSessions };
}

export function useHomeData(): HomeData {
  const [data, setData] = useState<HomeData>(() => loadHomeData());

  useFocusEffect(
    useCallback(() => {
      setData(loadHomeData());
    }, []),
  );

  return data;
}
