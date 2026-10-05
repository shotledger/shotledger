// Fält stations (docs/specs/falt-stations-spec.md). A station is not a series:
// see the table's comment in schema.ts for why it has its own table.
import { and, eq, isNull } from 'drizzle-orm';
import {
  faltResult,
  poangfaltPoints,
  scoringStations,
  SHOTS_PER_STATION,
  type FaltStationEntry,
} from '@shotledger/shared';

import { faltStations } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';
import { withSessionVolumeDelta } from './volume';

export interface AddStationInput {
  sessionId: string;
  position: number;
  hits: number;
  figuresHit: number;
  /** Figures set out at the station, 1-6; null when not recorded. */
  figureCount?: number | null;
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
  figureCount?: number | null;
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
  const { figureCount } = input;
  if (
    figureCount != null &&
    (!Number.isInteger(figureCount) || figureCount < 1 || figureCount > SHOTS_PER_STATION)
  ) {
    throw new RangeError(
      `${where}: figureCount must be an integer 1-${SHOTS_PER_STATION} or null, got ${figureCount}`,
    );
  }
  if (figureCount != null && figuresHit > figureCount) {
    throw new RangeError(`${where}: ${figuresHit} figures hit of ${figureCount}`);
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
    figureCount: input.figureCount ?? null,
    points: input.points ?? null,
    pointsMax: input.pointsMax ?? null,
    isScratched: input.isScratched ? 1 : 0,
    isShootOff: input.isShootOff ? 1 : 0,
    photoUri: input.photoUri ?? null,
    note: input.note ?? null,
  };
  // Six rounds went down the barrel whatever the marker wrote (D.6.4 p. 91),
  // scratched or not: volume, not score (SCORE_003's split).
  withSessionVolumeDelta(db, input.sessionId, () => db.insert(faltStations).values(row).run());
  return row;
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
    figureCount: patch.figureCount === undefined ? current.figureCount : patch.figureCount,
    points: patch.points === undefined ? current.points : patch.points,
    pointsMax: patch.pointsMax === undefined ? current.pointsMax : patch.pointsMax,
    isScratched: patch.isScratched ?? current.isScratched === 1,
  };
  assertEnterable(merged);

  db.update(faltStations)
    .set({
      hits: merged.hits,
      figuresHit: merged.figuresHit,
      figureCount: merged.figureCount,
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
  withSessionVolumeDelta(db, current.sessionId, () => tombstoneStation(db, id));
}

/** Soft-deletes a station without moving any counter — for a caller that moves them itself. */
export function tombstoneStation(db: Database, id: string): void {
  const now = nowIso();
  db.update(faltStations)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(faltStations.id, id), isNull(faltStations.deletedAt)))
    .run();
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
