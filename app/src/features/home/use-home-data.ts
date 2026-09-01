// Home screen data (§4 M2): total shots logged + latest 10 sessions with a
// computed score total. Refetches on focus (e.g. after loading demo data
// from /dev) rather than a true live-query — see M2 report for the tradeoff.
import { sumValueTenths, tenthsToScore } from '@shotledger/shared';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { db } from '@/db/client';
import { countAllShots, listScoredShotsForSession } from '@/db/queries/shots';
import { listSessions } from '@/db/queries/sessions';

export interface HomeSessionRow {
  id: string;
  name: string;
  type: 'training' | 'competition';
  startedAt: string;
  total: number;
}

export interface HomeData {
  shotsLoggedTotal: number;
  latestSessions: HomeSessionRow[];
}

function loadHomeData(): HomeData {
  if (!db) return { shotsLoggedTotal: 0, latestSessions: [] };

  const sessions = listSessions(db).slice(0, 10);
  const latestSessions = sessions.map((session) => ({
    id: session.id,
    name: session.name,
    type: session.type,
    startedAt: session.startedAt,
    total: tenthsToScore(sumValueTenths(listScoredShotsForSession(db, session.id))),
  }));

  return { shotsLoggedTotal: countAllShots(db), latestSessions };
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
