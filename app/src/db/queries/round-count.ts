import { eq } from 'drizzle-orm';

import { series, sessions } from '../schema';
import type { Database } from '../types';
import { getFirearm, updateFirearm } from './firearms';
import { listShotsForSeries, replaceSeriesShots, type AddShotInput } from './shots';

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
