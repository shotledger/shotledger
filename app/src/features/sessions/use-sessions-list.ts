// Data for the full sessions list (#317). Home deliberately loads only what a
// ten-row summary needs; this loads every session plus the fields the filters
// key on, and refetches on focus like every other M2+ data hook.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getDiscipline } from '@shotledger/shared';
import { db } from '@/db/client';
import { faltSessionResult } from '@/db/queries/falt';
import { faltSummaryOf } from '@/features/session/format-falt-result';
import { listFirearms } from '@/db/queries/firearms';
import { listSessions } from '@/db/queries/sessions';
import { listAllStatsSeries } from '@/db/queries/stats';
import { listTagsBySession } from '@/db/queries/tags';

import { buildSessionListRow, type SessionListRow } from './session-list-row';

export interface FirearmOption {
  id: string;
  label: string;
}

export interface SessionsListData {
  rows: SessionListRow[];
  /** Every discipline id present in the data, in first-seen (newest-first) order. */
  disciplineIds: string[];
  /** Every tag name present, sorted. */
  tagNames: string[];
  firearms: FirearmOption[];
}

function loadSessionsList(): SessionsListData {
  const sessions = listSessions(db);
  const tagsBySession = listTagsBySession(db);

  // Home does `allSeries.filter(s => s.sessionId === session.id)` inside its
  // row loop, which is fine for ten rows and quadratic for 267. Bucket once.
  const seriesBySession = new Map<string, (typeof allSeries)[number][]>();
  const allSeries = listAllStatsSeries(db);
  for (const series of allSeries) {
    const bucket = seriesBySession.get(series.sessionId);
    if (bucket) bucket.push(series);
    else seriesBySession.set(series.sessionId, [series]);
  }

  const rows = sessions.map((session) => {
    // Same as Home: a fält session has no series, so its result comes from its stations.
    const falt =
      getDiscipline(session.disciplineId)?.scoring === 'hits'
        ? faltSessionResult(db, session.id)
        : null;
    return buildSessionListRow(
      session,
      seriesBySession.get(session.id) ?? [],
      tagsBySession.get(session.id) ?? [],
      falt === null ? null : faltSummaryOf(session.faltResultMode, falt),
    );
  });

  const disciplineIds: string[] = [];
  for (const row of rows) {
    if (!disciplineIds.includes(row.disciplineId)) disciplineIds.push(row.disciplineId);
  }

  const tagNames = [...new Set(rows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b));

  const firearms = listFirearms(db).map((firearm) => ({
    id: firearm.id,
    label: [firearm.make, firearm.model].filter(Boolean).join(' ') || firearm.id,
  }));

  return { rows, disciplineIds, tagNames, firearms };
}

export function useSessionsList(): SessionsListData & { refresh: () => void } {
  const [data, setData] = useState<SessionsListData>(() => loadSessionsList());
  const refresh = useCallback(() => setData(loadSessionsList()), []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { ...data, refresh };
}
