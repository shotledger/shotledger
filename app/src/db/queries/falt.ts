// Fält stations (docs/specs/falt-stations-spec.md). A station is not a series:
// see the table's comment in schema.ts for why it has its own table.
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  faltResult,
  poangfaltPoints,
  scoringStations,
  SHOTS_PER_STATION,
  type FaltStationEntry,
} from '@shotledger/shared';

import { faltStations, sessions } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';
import { applyRoundCountDelta } from './firearm-counters';

export interface AddStationInput {
  sessionId: string;
  position: number;
  hits: number;
  figuresHit: number;
  /** Poängmål points scored; null = the station carried no ringed figure. */
  points?: number | null;
  /** What that poängmål could give — the arrangör picks the scheme (ruling 2026-09-22). */
  pointsMax?: number | null;
  isScratched?: boolean;
  isShootOff?: boolean;
  photoUri?: string | null;
  note?: string | null;
}

export type StationRow = typeof faltStations.$inferSelect;

/**
 * Rejects numbers no station could have produced — but only for a station
 * that still scores. A scratched station is a record of what went wrong, and
 * forcing it to be arithmetically possible would lose exactly the evidence it
 * exists to keep.
 */
function assertEnterable(input: {
  position: number;
  hits: number;
  figuresHit: number;
  points?: number | null;
  pointsMax?: number | null;
  isScratched?: boolean;
}): void {
  if (input.isScratched) return;
  const where = `station ${input.position}`;
  const { hits, figuresHit } = input;
  if (!Number.isInteger(hits) || hits < 0 || hits > SHOTS_PER_STATION) {
    throw new RangeError(`${where}: hits must be an integer 0-${SHOTS_PER_STATION}, got ${hits}`);
  }
  if (!Number.isInteger(figuresHit) || figuresHit < 0 || figuresHit > hits) {
    throw new RangeError(`${where}: figuresHit must be an integer 0-${hits}, got ${figuresHit}`);
  }
  if (hits > 0 && figuresHit === 0) {
    throw new RangeError(`${where}: ${hits} hits cannot be spread over 0 figures`);
  }
  const { points, pointsMax } = input;
  if (points != null && (!Number.isInteger(points) || points < 0)) {
    throw new RangeError(`${where}: points must be a non-negative integer or null, got ${points}`);
  }
  if (pointsMax != null && points != null && points > pointsMax) {
    throw new RangeError(`${where}: ${points} points on a poängmål worth ${pointsMax}`);
  }
}

export function addStation(db: Database, input: AddStationInput): StationRow {
  assertEnterable(input);

  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    sessionId: input.sessionId,
    position: input.position,
    hits: input.hits,
    figuresHit: input.figuresHit,
    points: input.points ?? null,
    pointsMax: input.pointsMax ?? null,
    isScratched: input.isScratched ? 1 : 0,
    isShootOff: input.isShootOff ? 1 : 0,
    photoUri: input.photoUri ?? null,
    note: input.note ?? null,
  };
  db.insert(faltStations).values(row).run();
  // Six rounds went down the barrel whatever the marker wrote (D.6.4 p. 91).
  // A scratched station counts here for the same reason a sighter does: it is
  // volume, not score (SCORE_003's split).
  moveRoundCount(db, input.sessionId, SHOTS_PER_STATION);
  return row;
}

/** Moves the session firearm's counters, if the session has one. */
function moveRoundCount(db: Database, sessionId: string, delta: number): void {
  const sessionRow = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (sessionRow?.firearmId) applyRoundCountDelta(db, sessionRow.firearmId, delta);
}

export function listStationsForSession(db: Database, sessionId: string): StationRow[] {
  return db
    .select()
    .from(faltStations)
    .where(and(eq(faltStations.sessionId, sessionId), isNull(faltStations.deletedAt)))
    .orderBy(faltStations.position)
    .all();
}

export function getStation(db: Database, id: string): StationRow | undefined {
  return db
    .select()
    .from(faltStations)
    .where(and(eq(faltStations.id, id), isNull(faltStations.deletedAt)))
    .get();
}

export function updateStation(
  db: Database,
  id: string,
  patch: Partial<Omit<AddStationInput, 'sessionId' | 'position'>>,
): StationRow | undefined {
  const current = getStation(db, id);
  if (!current) return undefined;

  const merged = {
    position: current.position,
    hits: patch.hits ?? current.hits,
    figuresHit: patch.figuresHit ?? current.figuresHit,
    points: patch.points === undefined ? current.points : patch.points,
    pointsMax: patch.pointsMax === undefined ? current.pointsMax : patch.pointsMax,
    isScratched: patch.isScratched ?? current.isScratched === 1,
  };
  assertEnterable(merged);

  db.update(faltStations)
    .set({
      hits: merged.hits,
      figuresHit: merged.figuresHit,
      points: merged.points,
      pointsMax: merged.pointsMax,
      isScratched: merged.isScratched ? 1 : 0,
      ...(patch.isShootOff === undefined ? {} : { isShootOff: patch.isShootOff ? 1 : 0 }),
      ...(patch.photoUri === undefined ? {} : { photoUri: patch.photoUri }),
      ...(patch.note === undefined ? {} : { note: patch.note }),
      updatedAt: nowIso(),
    })
    .where(and(eq(faltStations.id, id), isNull(faltStations.deletedAt)))
    .run();
  return getStation(db, id);
}

export function softDeleteStation(db: Database, id: string): void {
  const current = getStation(db, id);
  if (!current) return;

  const now = nowIso();
  db.update(faltStations)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(faltStations.id, id), isNull(faltStations.deletedAt)))
    .run();
  moveRoundCount(db, current.sessionId, -SHOTS_PER_STATION);
}

/** Rounds fired at a session's live stations, scored or not.
 *
 * @Requirements SCORE_006
 */
export function stationRoundsForSession(db: Database, sessionId: string): number {
  return listStationsForSession(db, sessionId).length * SHOTS_PER_STATION;
}

/** Rounds fired at every live station of every live session.
 *
 * @Requirements SCORE_006
 */
export function countAllStationRounds(db: Database): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(faltStations)
    .innerJoin(sessions, eq(faltStations.sessionId, sessions.id))
    .where(and(isNull(faltStations.deletedAt), isNull(sessions.deletedAt)))
    .get();
  return (row?.count ?? 0) * SHOTS_PER_STATION;
}

export interface FaltSessionResult {
  stationCount: number;
  hits: number;
  figuresHit: number;
  /** Poängmål points over the scoring stations; null when none carried one. */
  ringedFigurePoints: number | null;
  /** One point per hit plus one per hit figure (D.6.11 p. 95). */
  poangfaltPoints: number;
  /** What those poängmål could have given, for an "X of Y" reading; null when none. */
  pointsMax: number | null;
}

/** A session's fält result, over the stations that actually score. */
export function faltSessionResult(db: Database, sessionId: string): FaltSessionResult {
  const rows = listStationsForSession(db, sessionId);
  const entries: FaltStationEntry[] = rows.map((row) => ({
    hits: row.hits,
    figuresHit: row.figuresHit,
    points: row.points,
    isScratched: row.isScratched === 1,
    isShootOff: row.isShootOff === 1,
  }));

  const scoring = scoringStations(entries);
  const result = faltResult(scoring);

  // The max is summed over the same stations the points came from, so an
  // excluded station takes its poängmål with it in both directions.
  let pointsMax: number | null = null;
  rows.forEach((row) => {
    if (row.isScratched === 1 || row.isShootOff === 1) return;
    if (row.pointsMax != null) pointsMax = (pointsMax ?? 0) + row.pointsMax;
  });

  return {
    ...result,
    poangfaltPoints: poangfaltPoints(result),
    pointsMax,
  };
}
