// What the series entry screen shows and where Next Series goes (#822
// direction A, "Entering a series"). Pure over the session detail's rows,
// so the rules are tested without a screen; the web's Enter Series runs the
// same running totals over its typed rows (web/src/entry/running-totals.ts).
import {
  seriesSectionOf,
  sessionInnerTenCount,
  sessionResults,
  type EntryShot,
} from '@shotledger/shared';

import type { SeriesRow } from '@/features/session/use-session-detail';

/** The series being entered, as the keypad holds it now. */
export interface CurrentSeries {
  /** Null while the series is not saved yet. */
  rowId: string | null;
  position: number;
  isFinal: boolean;
  isSighter: boolean;
  /** A särskjutning series counts toward no score (#727 PR C, S1). */
  isShootOff: boolean;
  shots: readonly EntryShot[];
}

/** One series as sessionResults reads it. */
function forResults(row: SeriesRow) {
  return {
    isSighter: row.isSighter,
    isFinal: row.isFinal,
    isShootOff: row.isShootOff,
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
 * inner-ten count, `loadSessionDetail`).
 */
export function liveSessionTotals(
  rows: readonly SeriesRow[],
  current: CurrentSeries,
): { totalTenths: number; innerTens: number } {
  const list = [
    ...rows.filter((row) => row.id !== current.rowId).map(forResults),
    {
      isSighter: current.isSighter,
      isFinal: current.isFinal,
      isShootOff: current.isShootOff,
      shots: [...current.shots],
      totalOverride: null,
    },
  ];
  return {
    totalTenths: sessionResults(list).totalTenths,
    innerTens: sessionInnerTenCount(list),
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
 * main round ends once a final has begun. A shoot-off is its own section
 * (#727 PR C, S5): never the next series of another, and never extended,
 * since no screen adds one.
 */
export function nextSeriesTarget(
  rows: readonly Pick<SeriesRow, 'position' | 'isFinal' | 'isShootOff'>[],
  current: Pick<CurrentSeries, 'position' | 'isFinal' | 'isShootOff'>,
  isFixedFormat: boolean,
): NextSeriesTarget | null {
  const section = seriesSectionOf(current);
  const later = rows
    .filter((row) => seriesSectionOf(row) === section && row.position > current.position)
    .sort((a, b) => a.position - b.position)[0];
  if (later) return { position: later.position, isFinal: later.isFinal, isNew: false };
  if (isFixedFormat || section === 'shootOff') return null;
  if (!current.isFinal && rows.some((row) => seriesSectionOf(row) === 'final')) return null;
  const last = rows.reduce((max, row) => Math.max(max, row.position), current.position);
  return { position: last + 1, isFinal: current.isFinal, isNew: true };
}

/** "Series 4 of 10" for a fixed format, whose count is known; null otherwise. */
export function seriesCountOf(
  rows: readonly Pick<SeriesRow, 'isFinal' | 'isShootOff'>[],
  current: Pick<CurrentSeries, 'isFinal' | 'isShootOff'>,
  isFixedFormat: boolean,
): number | null {
  if (!isFixedFormat) return null;
  const section = seriesSectionOf(current);
  return rows.filter((row) => seriesSectionOf(row) === section).length;
}
