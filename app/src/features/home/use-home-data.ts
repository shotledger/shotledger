// Home screen data (§4 M2): total rounds logged + latest 10 sessions, each
// with its score total, per-series average and X count (spec Amendment A2
// §A2.4). Refetches on focus (e.g. after loading demo data from /dev) rather
// than a true live-query — see M2 report for the tradeoff.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { db } from '@/db/client';
import { countVolumeRounds } from '@/db/queries/shots';
import { listAllStatsSeries } from '@/db/queries/stats';
import { listSessions } from '@/db/queries/sessions';

import { buildHomeSessionRow, type HomeSessionRow } from './home-session-row';

export type { HomeSessionRow };

export interface HomeData {
  /** Volume: every logged shot plus every session's unscored extra rounds. */
  shotsLoggedTotal: number;
  latestSessions: HomeSessionRow[];
}

function loadHomeData(): HomeData {
  if (!db) return { shotsLoggedTotal: 0, latestSessions: [] };

  const sessions = listSessions(db).slice(0, 10);
  const allSeries = listAllStatsSeries(db);
  const latestSessions = sessions.map((session) =>
    buildHomeSessionRow(
      session,
      allSeries.filter((series) => series.sessionId === session.id),
    ),
  );

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
