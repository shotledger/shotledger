// What the series entry screen shows and where Next Series goes (#822
// direction A, "Entering a series"). Pure over the session detail's rows,
// so the rules are tested without a screen; the web's Enter Series runs the
// same running totals over its typed rows (web/src/entry/running-totals.ts).
import { sessionInnerTenCount, sessionResults, type EntryShot } from '@shotledger/shared';

import type { SeriesRow } from '@/features/session/use-session-detail';

/** The series being entered, as the keypad holds it now. */
export interface CurrentSeries {
  /** Null while the series is not saved yet. */
  rowId: string | null;
  position: number;
  isFinal: boolean;
  isSighter: boolean;
  shots: readonly EntryShot[];
}

/** One series as sessionResults reads it. */
function forResults(row: SeriesRow) {
  return {
    isSighter: row.isSighter,
    isFinal: row.isFinal,
    shots: row.shots,
    totalOverride: row.isTotalOverride
      ? { tenths: row.totalTenths, shotCount: row.totalOverrideShotCount ?? 0 }
      : null,
  };
}

/**
 * The session's total and inner tens with the series on the keypad counted
 * as it stands, not as it was last saved — the figures move with each key,
 * as session detail will show them after Save (the same sessionResults and
 * inner-ten count, `loadSessionDetail`). A stored inner-ten figure (a
 * ShotLog import, which has no shot flags) wins, as it does there.
 */
export function liveSessionTotals(
  rows: readonly SeriesRow[],
  current: CurrentSeries,
  storedInnerTenCount: number | null,
): { totalTenths: number; innerTens: number } {
  const list = [
    ...rows.filter((row) => row.id !== current.rowId).map(forResults),
    {
      isSighter: current.isSighter,
      isFinal: current.isFinal,
      shots: [...current.shots],
      totalOverride: null,
    },
  ];
  return {
    totalTenths: sessionResults(list).totalTenths,
    innerTens: storedInnerTenCount ?? sessionInnerTenCount(list),
  };
}

export interface NextSeriesTarget {
  position: number;
  isFinal: boolean;
  /** Not in the database yet: the next screen creates it on save, as Add Series does. */
  isNew: boolean;
}

/**
 * Where Next Series goes, or null when this is the last series and the
 * action is Save. The next series of the same section if one exists (a fixed
 * format lays them all out up front); otherwise, in a free format, a new one
 * at the end, exactly where session detail's Add Series would put it
 * (`nextSeriesPosition`). A fixed format ends at its last series, and the
 * main round ends once a final has begun.
 */
export function nextSeriesTarget(
  rows: readonly Pick<SeriesRow, 'position' | 'isFinal'>[],
  current: Pick<CurrentSeries, 'position' | 'isFinal'>,
  isFixedFormat: boolean,
): NextSeriesTarget | null {
  const later = rows
    .filter((row) => row.isFinal === current.isFinal && row.position > current.position)
    .sort((a, b) => a.position - b.position)[0];
  if (later) return { position: later.position, isFinal: later.isFinal, isNew: false };
  if (isFixedFormat) return null;
  if (!current.isFinal && rows.some((row) => row.isFinal)) return null;
  const last = rows.reduce((max, row) => Math.max(max, row.position), current.position);
  return { position: last + 1, isFinal: current.isFinal, isNew: true };
}

/** "Series 4 of 10" for a fixed format, whose count is known; null otherwise. */
export function seriesCountOf(
  rows: readonly Pick<SeriesRow, 'isFinal'>[],
  isFinal: boolean,
  isFixedFormat: boolean,
): number | null {
  if (!isFixedFormat) return null;
  return rows.filter((row) => row.isFinal === isFinal).length;
}
