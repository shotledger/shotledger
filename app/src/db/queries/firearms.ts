import { and, eq, isNull } from 'drizzle-orm';

import { firearms } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export type WeaponType = 'pistol' | 'revolver' | 'rifle' | 'airgun';

export interface CreateFirearmInput {
  make: string;
  model: string;
  caliber?: string | null;
  weaponType?: WeaponType | null;
  serialNumber?: string | null;
  vapenId?: string | null;
  loadSystem?: string | null;
  notes?: string | null;
  roundCount?: number;
  maintenanceIntervalRounds?: number | null;
  roundsSinceMaintenance?: number;
}

export function createFirearm(db: Database, input: CreateFirearmInput) {
  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    make: input.make,
    model: input.model,
    caliber: input.caliber ?? null,
    weaponType: input.weaponType ?? null,
    serialNumber: input.serialNumber ?? null,
    vapenId: input.vapenId ?? null,
    loadSystem: input.loadSystem ?? null,
    notes: input.notes ?? null,
    roundCount: input.roundCount ?? 0,
    maintenanceIntervalRounds: input.maintenanceIntervalRounds ?? null,
    roundsSinceMaintenance: input.roundsSinceMaintenance ?? 0,
  };
  db.insert(firearms).values(row).run();
  return row;
}

export function getFirearm(db: Database, id: string) {
  return db
    .select()
    .from(firearms)
    .where(and(eq(firearms.id, id), isNull(firearms.deletedAt)))
    .get();
}

export function listFirearms(db: Database) {
  return db.select().from(firearms).where(isNull(firearms.deletedAt)).orderBy(firearms.make).all();
}

export type UpdateFirearmInput = Partial<CreateFirearmInput>;

export function updateFirearm(db: Database, id: string, patch: UpdateFirearmInput) {
  const now = nowIso();
  db.update(firearms)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(firearms.id, id), isNull(firearms.deletedAt)))
    .run();
  return getFirearm(db, id);
}

export function softDeleteFirearm(db: Database, id: string) {
  const now = nowIso();
  db.update(firearms).set({ deletedAt: now, updatedAt: now }).where(eq(firearms.id, id)).run();
}
