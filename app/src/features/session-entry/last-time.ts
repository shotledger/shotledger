// "Last time" on the series entry screen (#822): the same scored series of
// the previous session of this discipline. The matching rules are shared
// with the web (shared/src/session-entry/last-time.ts); this reads the rows.
import {
  previousSessionOf,
  scoredOrdinal,
  seriesAtOrdinal,
  type LastTimeSeries,
} from '@shotledger/shared/src/session-entry/last-time';

import { db } from '@/db/client';
import { listSeriesForSession } from '@/db/queries/series';
import { listSessions } from '@/db/queries/sessions';
import { listShotsForSeries } from '@/db/queries/shots';
import type { SeriesRow } from '@/features/session/use-session-detail';

export interface LastTime {
  totalTenths: number;
  /** Null for a series stored as a total only. */
  innerTens: number | null;
}

export function loadLastTime(
  session: { id: string; disciplineId: string; startedAt: string; decimalScoring: number },
  rows: readonly SeriesRow[],
  current: {
    rowId: string | null;
    position: number;
    isFinal: boolean;
    isSighter: boolean;
    isShootOff?: boolean;
  },
): LastTime | null {
  const ordinal = scoredOrdinal(
    rows.filter((row) => row.id !== current.rowId),
    current,
  );
  if (ordinal === null) return null;

  const candidates = listSessions(db, {
    kind: 'series',
    disciplineId: session.disciplineId,
    startedTo: session.startedAt,
  }).map((row) => ({ ...row, decimalScoring: row.decimalScoring === 1 }));
  const previous = previousSessionOf(candidates, {
    ...session,
    decimalScoring: session.decimalScoring === 1,
  });
  if (!previous) return null;

  // A series saved with no shots (a blank or photo-only one) scored nothing to compare.
  const blank = new Set<number>();
  const series: LastTimeSeries[] = listSeriesForSession(db, previous.id).map((row) => {
    const shots = listShotsForSeries(db, row.id);
    const isOverride = row.isTotalOverride === 1 && row.totalOverrideTenths !== null;
    if (!isOverride && shots.length === 0) blank.add(row.position);
    return {
      position: row.position,
      isSighter: row.isSighter === 1,
      isFinal: row.isFinal === 1,
      isShootOff: row.isShootOff === 1,
      totalTenths: isOverride
        ? row.totalOverrideTenths!
        : shots.reduce((sum, shot) => sum + shot.valueTenths, 0),
      innerTens: isOverride ? null : shots.filter((shot) => shot.isInnerTen === 1).length,
    };
  });
  const match = seriesAtOrdinal(series, ordinal, current.isFinal);
  return match && !blank.has(match.position)
    ? { totalTenths: match.totalTenths, innerTens: match.innerTens }
    : null;
}
