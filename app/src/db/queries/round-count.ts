import { eq } from 'drizzle-orm';

import { series } from '../schema';
import type { Database } from '../types';
import { listStationsForSession, tombstoneStation } from './falt';
// Re-exported: this was defined here before a fält station needed it too.
export { applyRoundCountDelta } from './firearm-counters';
import { getSession, softDeleteSession, updateSession } from './sessions';
import { listSeriesForSession, softDeleteSeries } from './series';
import { listShotsForSeries, replaceSeriesShots, softDeleteShot, type AddShotInput } from './shots';
import { withSessionVolumeDelta } from './volume';

/** The session a series belongs to, deleted or not. */
function sessionIdOfSeries(db: Database, seriesId: string): string | undefined {
  return db
    .select({ sessionId: series.sessionId })
    .from(series)
    .where(eq(series.id, seriesId))
    .get()?.sessionId;
}

/** Runs `mutate`, moving the firearm counters by the series' session-volume delta. */
function withSeriesVolumeDelta<T>(db: Database, seriesId: string, mutate: () => T): T {
  const sessionId = sessionIdOfSeries(db, seriesId);
  return sessionId ? withSessionVolumeDelta(db, sessionId, mutate) : mutate();
}

/**
 * Replaces a series' shots (as `replaceSeriesShots`) and moves the linked
 * firearm's round counters by the change in the session's volume — §4 M4:
 * every shot counts, sighters included, and re-editing a saved series moves
 * only the difference.
 */
export function saveSeriesShots(
  db: Database,
  seriesId: string,
  entered: readonly Omit<AddShotInput, 'seriesId' | 'position'>[],
) {
  return withSeriesVolumeDelta(db, seriesId, () => replaceSeriesShots(db, seriesId, entered));
}

/** Soft-deletes a series and its shots without moving any counter. */
function tombstoneSeries(db: Database, seriesId: string) {
  for (const shot of listShotsForSeries(db, seriesId)) {
    softDeleteShot(db, shot.id);
  }
  softDeleteSeries(db, seriesId);
}

/**
 * Deletes a series (swipe-to-delete on the session detail's series list):
 * soft-deletes its shots and the series row (§3: soft-delete everywhere) and
 * backs its volume — shot rows, or a total-only series' stored count — out of
 * the linked firearm's round counters.
 */
export function deleteSeriesAndShots(db: Database, seriesId: string) {
  withSeriesVolumeDelta(db, seriesId, () => tombstoneSeries(db, seriesId));
}

/**
 * Deletes a session (swipe-to-delete on the sessions list): soft-deletes its
 * series, shots and fält stations and the session row itself (§3:
 * soft-delete everywhere), and backs the session's whole volume out of the
 * linked firearm's round counters in one move.
 */
export function deleteSessionAndSeries(db: Database, sessionId: string) {
  if (!getSession(db, sessionId)) return;

  withSessionVolumeDelta(db, sessionId, () => {
    for (const seriesRow of listSeriesForSession(db, sessionId)) {
      tombstoneSeries(db, seriesRow.id);
    }
    for (const station of listStationsForSession(db, sessionId)) {
      tombstoneStation(db, station.id);
    }
    softDeleteSession(db, sessionId);
  });
}

/**
 * Sets a session's unscored extra rounds (spec Amendment A1 §A1.3) and moves
 * the linked firearm's counters by the **delta**, exactly as the shot path
 * does — so correcting 20 to 5 removes 15 rather than adding another 5
 * (A-X6). `null` and `0` both mean "none" (A-X7). No series or shot row is
 * ever created: extra rounds are volume, never score (A-X4/A-X5).
 */
export function setSessionExtraRounds(db: Database, sessionId: string, extraRounds: number | null) {
  if (extraRounds !== null && (!Number.isInteger(extraRounds) || extraRounds < 0)) {
    throw new RangeError(`extraRounds must be a non-negative integer or null, got ${extraRounds}`);
  }
  const sessionRow = getSession(db, sessionId);
  if (!sessionRow) return undefined;

  return withSessionVolumeDelta(db, sessionId, () => updateSession(db, sessionId, { extraRounds }));
}
