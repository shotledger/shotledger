import { eq } from 'drizzle-orm';

import { series, sessions } from '../schema';
import type { Database } from '../types';
import { getFirearm, updateFirearm } from './firearms';
import { getSession, updateSession } from './sessions';
import { softDeleteSeries } from './series';
import { listShotsForSeries, replaceSeriesShots, softDeleteShot, type AddShotInput } from './shots';

/** Adds `delta` rounds to a firearm's lifetime and since-maintenance counters (never below zero). */
export function applyRoundCountDelta(db: Database, firearmId: string, delta: number) {
  const firearm = getFirearm(db, firearmId);
  if (!firearm) return undefined;
  return updateFirearm(db, firearmId, {
    roundCount: Math.max(0, firearm.roundCount + delta),
    roundsSinceMaintenance: Math.max(0, firearm.roundsSinceMaintenance + delta),
  });
}

/**
 * Replaces a series' shots (as `replaceSeriesShots`) and keeps the linked
 * firearm's round counters in sync — §4 M4: the round counter increments
 * for every shot including sighters, but only for firearm-linked sessions.
 * Uses the shot-count delta (not the raw new count) so re-editing an
 * already-saved series adds/removes only the difference instead of
 * double-counting.
 */
export function saveSeriesShots(
  db: Database,
  seriesId: string,
  entered: readonly Omit<AddShotInput, 'seriesId' | 'position'>[],
) {
  const previousCount = listShotsForSeries(db, seriesId).length;
  const saved = replaceSeriesShots(db, seriesId, entered);
  const delta = saved.length - previousCount;

  if (delta !== 0) {
    const seriesRow = db.select().from(series).where(eq(series.id, seriesId)).get();
    const sessionRow = seriesRow
      ? db.select().from(sessions).where(eq(sessions.id, seriesRow.sessionId)).get()
      : undefined;
    if (sessionRow?.firearmId) {
      applyRoundCountDelta(db, sessionRow.firearmId, delta);
    }
  }

  return saved;
}

/**
 * Deletes a series (swipe-to-delete on the session detail's series list):
 * soft-deletes its shots and the series row (§3: soft-delete everywhere),
 * and backs the shot count out of the linked firearm's round counters —
 * mirrors `saveSeriesShots`' delta convention (removing N shots is the same
 * adjustment as editing them away). An override series (WebShooter/ShotLog
 * import) has no `shots` rows and was never counted into the round counter
 * on creation, so it contributes no delta here either.
 */
export function deleteSeriesAndShots(db: Database, seriesId: string) {
  const seriesShots = listShotsForSeries(db, seriesId);
  for (const shot of seriesShots) {
    softDeleteShot(db, shot.id);
  }

  const seriesRow = db.select().from(series).where(eq(series.id, seriesId)).get();
  const sessionRow = seriesRow
    ? db.select().from(sessions).where(eq(sessions.id, seriesRow.sessionId)).get()
    : undefined;
  if (sessionRow?.firearmId && seriesShots.length > 0) {
    applyRoundCountDelta(db, sessionRow.firearmId, -seriesShots.length);
  }

  softDeleteSeries(db, seriesId);
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

  const delta = (extraRounds ?? 0) - (sessionRow.extraRounds ?? 0);
  const updated = updateSession(db, sessionId, { extraRounds });
  if (delta !== 0 && sessionRow.firearmId) {
    applyRoundCountDelta(db, sessionRow.firearmId, delta);
  }
  return updated;
}
