// Rounds fired, read from the database and counted by the one shared rule,
// `sessionVolume` (#512). Every volume figure in the app comes from here, and
// every firearm-counter movement is a difference of two of them.
import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import {
  disciplineSeriesLength,
  sessionVolume,
  totalOnlyShotCount,
  type VolumeSeries,
} from '@shotledger/shared';

import { faltStations, series, sessions, shots } from '../schema';
import type { Database } from '../types';
import { applyRoundCountDelta } from './firearm-counters';
import { listFirearms } from './firearms';

/**
 * Each live session's rounds fired, keyed by session id, for the sessions
 * `where` (a condition on `sessions`) selects — all of them when omitted.
 * Three grouped queries whatever the number of sessions.
 *
 * @Requirements SCORE_010
 */
export function sessionVolumes(db: Database, where?: SQL): Map<string, number> {
  const live = and(isNull(sessions.deletedAt), where);

  const sessionRows = db
    .select({
      id: sessions.id,
      disciplineId: sessions.disciplineId,
      extraRounds: sessions.extraRounds,
    })
    .from(sessions)
    .where(live)
    .all();

  const seriesRows = db
    .select({
      sessionId: series.sessionId,
      isTotalOverride: series.isTotalOverride,
      overrideShotCount: series.totalOverrideShotCount,
      shotCount: sql<number>`count(${shots.id})`,
    })
    .from(series)
    .innerJoin(sessions, eq(series.sessionId, sessions.id))
    .leftJoin(shots, and(eq(shots.seriesId, series.id), isNull(shots.deletedAt)))
    .where(and(isNull(series.deletedAt), live))
    .groupBy(series.id)
    .all();

  const stationRows = db
    .select({ sessionId: faltStations.sessionId, count: sql<number>`count(*)` })
    .from(faltStations)
    .innerJoin(sessions, eq(faltStations.sessionId, sessions.id))
    .where(and(isNull(faltStations.deletedAt), live))
    .groupBy(faltStations.sessionId)
    .all();

  const seriesBySession = new Map<string, VolumeSeries[]>();
  for (const row of seriesRows) {
    const bucket = seriesBySession.get(row.sessionId) ?? [];
    bucket.push({
      shotCount: row.shotCount,
      totalOnly: row.isTotalOverride === 1,
      overrideShotCount: row.overrideShotCount,
    });
    seriesBySession.set(row.sessionId, bucket);
  }
  const stationsBySession = new Map(stationRows.map((row) => [row.sessionId, row.count]));

  return new Map(
    sessionRows.map((row) => [
      row.id,
      sessionVolume({
        series: seriesBySession.get(row.id) ?? [],
        extraRounds: row.extraRounds,
        stationCount: stationsBySession.get(row.id) ?? 0,
        seriesLength: disciplineSeriesLength(row.disciplineId),
      }),
    ]),
  );
}

/** Rounds fired across the selected live sessions (all when `where` is omitted). */
export function totalVolumeRounds(db: Database, where?: SQL): number {
  let total = 0;
  for (const volume of sessionVolumes(db, where).values()) total += volume;
  return total;
}

/** Rounds fired across the given sessions; deleted or unknown ids count 0. */
export function totalVolumeRoundsFor(db: Database, sessionIds: readonly string[]): number {
  if (sessionIds.length === 0) return 0;
  return totalVolumeRounds(db, inArray(sessions.id, [...sessionIds]));
}

/** One live session's rounds fired; 0 for a deleted or unknown session. */
export function sessionVolumeRounds(db: Database, sessionId: string): number {
  return sessionVolumes(db, eq(sessions.id, sessionId)).get(sessionId) ?? 0;
}

/**
 * Runs `mutate` and moves the session's firearm counters by its volume after
 * minus before — so any edit, however it changes the rows, moves the counter
 * by exactly what it changed. No firearm, no movement.
 */
export function withSessionVolumeDelta<T>(db: Database, sessionId: string, mutate: () => T): T {
  const firearmId = db
    .select({ firearmId: sessions.firearmId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get()?.firearmId;
  if (!firearmId) return mutate();

  const before = sessionVolumeRounds(db, sessionId);
  const result = mutate();
  const delta = sessionVolumeRounds(db, sessionId) - before;
  if (delta !== 0) applyRoundCountDelta(db, firearmId, delta);
  return result;
}

export interface FirearmCounterDrift {
  firearmId: string;
  make: string;
  model: string;
  /** Rounds in the firearm's total-only series that its counters never got. */
  rounds: number;
}

/**
 * Each live firearm's counter drift: the rounds of every live total-only
 * series on its live sessions, by today's rule. Counters written before #512
 * never got them; Adjust Round Count corrects a counter by this figure. A
 * one-off read for the /dev screen — it writes nothing.
 */
export function firearmCounterDrift(db: Database): FirearmCounterDrift[] {
  const rows = db
    .select({
      firearmId: sessions.firearmId,
      disciplineId: sessions.disciplineId,
      storedShotCount: series.totalOverrideShotCount,
    })
    .from(series)
    .innerJoin(sessions, eq(series.sessionId, sessions.id))
    .where(
      and(
        eq(series.isTotalOverride, 1),
        isNull(series.deletedAt),
        isNull(sessions.deletedAt),
        isNotNull(sessions.firearmId),
      ),
    )
    .all();

  const drift = new Map<string, number>();
  for (const row of rows) {
    const rounds = totalOnlyShotCount(
      row.storedShotCount,
      disciplineSeriesLength(row.disciplineId),
    );
    drift.set(row.firearmId!, (drift.get(row.firearmId!) ?? 0) + rounds);
  }
  return listFirearms(db).map((firearm) => ({
    firearmId: firearm.id,
    make: firearm.make,
    model: firearm.model,
    rounds: drift.get(firearm.id) ?? 0,
  }));
}
