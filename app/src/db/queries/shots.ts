import { and, eq, isNull } from 'drizzle-orm';

import { shots } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export interface AddShotInput {
  seriesId: string;
  position: number;
  /** 0–109: integer mode stores value×10, decimal mode stores tenths (§3). */
  valueTenths: number;
  isInnerTen?: boolean;
  isInnerTenDecimal?: boolean;
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
    isInnerTenDecimal: input.isInnerTenDecimal ? 1 : 0,
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
  patch: Partial<Pick<AddShotInput, 'valueTenths' | 'isInnerTen' | 'isInnerTenDecimal'>>,
) {
  const now = nowIso();
  const values: Record<string, unknown> = { updatedAt: now };
  if (patch.valueTenths !== undefined) values.valueTenths = patch.valueTenths;
  if (patch.isInnerTen !== undefined) values.isInnerTen = patch.isInnerTen ? 1 : 0;
  if (patch.isInnerTenDecimal !== undefined)
    values.isInnerTenDecimal = patch.isInnerTenDecimal ? 1 : 0;
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
