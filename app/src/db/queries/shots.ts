import { and, eq, isNull, sql } from 'drizzle-orm';

import { series, shots } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';
import { totalVolumeRounds } from './volume';

export interface AddShotInput {
  seriesId: string;
  position: number;
  /** 0–109: integer mode stores value×10, decimal mode stores tenths (§3). */
  valueTenths: number;
  /** Centrumtia — the `(X)` key. A plain `X` is an ordinary ten (A1 §A1.1). */
  isInnerTen?: boolean;
}

export function addShot(db: Database, input: AddShotInput) {
  if (input.valueTenths < 0 || input.valueTenths > 109) {
    throw new RangeError(`value_tenths must be between 0 and 109, got ${input.valueTenths}`);
  }
  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    seriesId: input.seriesId,
    position: input.position,
    valueTenths: input.valueTenths,
    isInnerTen: input.isInnerTen ? 1 : 0,
    // is_inner_ten_decimal is DEPRECATED (A1 §A1.1.4): always written as 0.
    isInnerTenDecimal: 0,
  };
  db.insert(shots).values(row).run();
  return row;
}

export function listShotsForSeries(db: Database, seriesId: string) {
  return db
    .select()
    .from(shots)
    .where(and(eq(shots.seriesId, seriesId), isNull(shots.deletedAt)))
    .orderBy(shots.position)
    .all();
}

export function getShot(db: Database, id: string) {
  return db
    .select()
    .from(shots)
    .where(and(eq(shots.id, id), isNull(shots.deletedAt)))
    .get();
}

export function updateShot(
  db: Database,
  id: string,
  patch: Partial<Pick<AddShotInput, 'valueTenths' | 'isInnerTen'>>,
) {
  const now = nowIso();
  const values: Record<string, unknown> = { updatedAt: now };
  if (patch.valueTenths !== undefined) values.valueTenths = patch.valueTenths;
  if (patch.isInnerTen !== undefined) values.isInnerTen = patch.isInnerTen ? 1 : 0;
  db.update(shots)
    .set(values)
    .where(and(eq(shots.id, id), isNull(shots.deletedAt)))
    .run();
  return getShot(db, id);
}

export function softDeleteShot(db: Database, id: string) {
  const now = nowIso();
  db.update(shots).set({ deletedAt: now, updatedAt: now }).where(eq(shots.id, id)).run();
}

/**
 * Replaces a series' shots with the ones just entered on the keypad.
 * Old rows are tombstoned rather than deleted (§3: soft-delete everywhere),
 * so a re-entered series still syncs correctly.
 */
export function replaceSeriesShots(
  db: Database,
  seriesId: string,
  entered: readonly Omit<AddShotInput, 'seriesId' | 'position'>[],
) {
  for (const existing of listShotsForSeries(db, seriesId)) {
    softDeleteShot(db, existing.id);
  }
  return entered.map((shot, index) => addShot(db, { ...shot, seriesId, position: index + 1 }));
}

/**
 * Scored (non-sighter) shots for a session — the input to session-total math
 * (§3/§6.3: sighters count toward volume but never toward score). Feed the
 * result to `sumValueTenths` from `@shotledger/shared`.
 */
export function listScoredShotsForSession(db: Database, sessionId: string) {
  return db
    .select({ valueTenths: shots.valueTenths })
    .from(shots)
    .innerJoin(series, eq(shots.seriesId, series.id))
    .where(
      and(
        eq(series.sessionId, sessionId),
        eq(series.isSighter, 0),
        isNull(shots.deletedAt),
        isNull(series.deletedAt),
      ),
    )
    .all();
}

/** Total shots logged across all sessions (volume metric — sighters included). */
export function countAllShots(db: Database): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(shots)
    .where(isNull(shots.deletedAt))
    .get();
  return row?.count ?? 0;
}

/**
 * Home's "Shots Logged": every live session's volume (`sessionVolume`) —
 * not `countAllShots`, which misses extra rounds, stations and total-only
 * series.
 */
export function countVolumeRounds(db: Database): number {
  return totalVolumeRounds(db);
}
