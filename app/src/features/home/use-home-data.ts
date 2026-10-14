// Home screen data (§4 M2): the latest 10 sessions, each with its score
// total, per-series average and X count (spec Amendment A2 §A2.4), the
// session count, and what Start offers (#822). The lifetime totals left Home
// for Statistics in #822 (direction A). Refetches
// on focus (e.g. after loading demo data from /dev) rather than a true
// live-query — see M2 report for the tradeoff.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { db } from '@/db/client';
import { listAllStatsSeries } from '@/db/queries/stats';
import { listActiveFirearms } from '@/db/queries/firearms';
import { listSessions } from '@/db/queries/sessions';
import { enabledRegulationIds } from '@/features/regulations/use-regulations';
import { lastSessionDefaults } from '@shotledger/shared/src/disciplines/last-session-defaults';
import { faltSessionResult } from '@/db/queries/falt';
import { faltSummaryOf } from '@/features/session/format-falt-result';
import { listTagsBySession } from '@/db/queries/tags';

import { countSessionsByType, type HomeSessionCounts } from './home-session-counts';
import { getDiscipline } from '@shotledger/shared';

import { buildHomeSessionRow, type HomeSessionRow } from './home-session-row';

export type { HomeSessionRow };

/**
 * What Home's Start button offers: the last session's discipline and
 * firearm, the same ones New Session preselects (`lastSessionDefaults`, #822).
 */
export interface HomeStart {
  /** Null when the last session's discipline is not offered any more. */
  disciplineId: string | null;
  /** "Make Model", or null when the form will not preselect a firearm. */
  firearmName: string | null;
}

export interface HomeData extends HomeSessionCounts {
  latestSessions: HomeSessionRow[];
  /** Null before the first session: Home then shows its empty state. */
  start: HomeStart | null;
}

function loadHomeData(): HomeData {
  const allSessions = listSessions(db);
  const sessions = allSessions.slice(0, 10);
  const allSeries = listAllStatsSeries(db);
  const tagsBySession = listTagsBySession(db);
  const latestSessions = sessions.map((session) => {
    // A fält session has no series at all, so its row would otherwise read
    // "0p" forever (found on the emulator, #315).
    const isFalt = getDiscipline(session.disciplineId)?.scoring === 'hits';
    const falt = isFalt ? faltSessionResult(db, session.id) : null;
    return buildHomeSessionRow(
      session,
      allSeries.filter((series) => series.sessionId === session.id),
      tagsBySession.get(session.id) ?? [],
      falt === null ? null : faltSummaryOf(session.faltResultMode, falt),
    );
  });

  const firearms = listActiveFirearms(db);
  const defaults = lastSessionDefaults(allSessions, {
    regulationIds: enabledRegulationIds(),
    isFirearmPickable: (id) => firearms.some((firearm) => firearm.id === id),
  });
  const firearm = defaults?.firearmId
    ? firearms.find((candidate) => candidate.id === defaults.firearmId)
    : undefined;

  return {
    ...countSessionsByType(allSessions),
    latestSessions,
    start: defaults && {
      disciplineId: defaults.disciplineId,
      firearmName: firearm ? `${firearm.make} ${firearm.model}` : null,
    },
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
