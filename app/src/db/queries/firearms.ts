import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { FirearmOwnershipFact } from '@shotledger/shared';

import { firearms } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export type WeaponType = 'pistol' | 'revolver' | 'rifle' | 'airgun';

export interface CreateFirearmInput {
  make: string;
  model: string;
  caliber?: string | null;
  weaponType?: WeaponType | null;
  /** true own, false borrowed/club/another's; defaults to own (#286). */
  isOwn?: boolean;
  serialNumber?: string | null;
  vapenId?: string | null;
  loadSystem?: string | null;
  notes?: string | null;
  roundCount?: number;
  maintenanceIntervalRounds?: number | null;
  maintenanceIntervalMonths?: number | null;
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
    isOwn: input.isOwn ?? true,
    serialNumber: input.serialNumber ?? null,
    vapenId: input.vapenId ?? null,
    loadSystem: input.loadSystem ?? null,
    notes: input.notes ?? null,
    roundCount: input.roundCount ?? 0,
    maintenanceIntervalRounds: input.maintenanceIntervalRounds ?? null,
    maintenanceIntervalMonths: input.maintenanceIntervalMonths ?? null,
    archivedAt: null,
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

/**
 * Every live firearm, archived ones included: what history reads — session
 * filters, statistics, import matching (#799). Pickers for new data and the
 * Firearms list's main section read `listActiveFirearms`.
 */
export function listFirearms(db: Database) {
  return db.select().from(firearms).where(isNull(firearms.deletedAt)).orderBy(firearms.make).all();
}

/** The firearms the shooter still has: live and not archived (#799). */
export function listActiveFirearms(db: Database) {
  return db
    .select()
    .from(firearms)
    .where(and(isNull(firearms.deletedAt), isNull(firearms.archivedAt)))
    .orderBy(firearms.make)
    .all();
}

/**
 * Archives a firearm (#799): hidden from lists and pickers, its history kept.
 * Archiving one already archived keeps the first date.
 */
export function archiveFirearm(db: Database, id: string) {
  const now = nowIso();
  db.update(firearms)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(firearms.id, id), isNull(firearms.deletedAt), isNull(firearms.archivedAt)))
    .run();
  return getFirearm(db, id);
}

/** Brings an archived firearm back to the active lists (#799). */
export function restoreFirearm(db: Database, id: string) {
  const now = nowIso();
  db.update(firearms)
    .set({ archivedAt: null, updatedAt: now })
    .where(and(eq(firearms.id, id), isNull(firearms.deletedAt), isNotNull(firearms.archivedAt)))
    .run();
  return getFirearm(db, id);
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

/**
 * What the compliance profile reads to pick a default case (issue #286): the
 * weapon type and ownership of every firearm the shooter still has. A
 * tombstoned firearm is no longer a fact about them, so it is excluded; nor
 * is an archived one, which was sold, returned or retired (#799).
 */
export function listFirearmOwnershipFacts(db: Database): FirearmOwnershipFact[] {
  return db
    .select({ weaponType: firearms.weaponType, isOwn: firearms.isOwn })
    .from(firearms)
    .where(and(isNull(firearms.deletedAt), isNull(firearms.archivedAt)))
    .all()
    .map((row) => ({ weaponType: row.weaponType ?? null, isOwn: row.isOwn }));
}

export function softDeleteFirearm(db: Database, id: string) {
  const now = nowIso();
  db.update(firearms).set({ deletedAt: now, updatedAt: now }).where(eq(firearms.id, id)).run();
}
