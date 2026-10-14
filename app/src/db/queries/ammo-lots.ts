import { and, eq, isNull } from 'drizzle-orm';

import { ammoLots, sessions } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export interface CreateAmmoLotInput {
  label: string;
  caliber?: string | null;
  quantity?: number | null;
  purchasedOn?: string | null;
  isHandload?: boolean;
  brand?: string | null;
  product?: string | null;
  lotNumber?: string | null;
  bulletMake?: string | null;
  bulletModel?: string | null;
  bulletWeightGr?: number | null;
  velocityMps?: number | null;
  powder?: string | null;
  powderChargeGr?: number | null;
  primer?: string | null;
  brass?: string | null;
  colMm?: number | null;
  crimpMm?: number | null;
  notes?: string | null;
}

export function createAmmoLot(db: Database, input: CreateAmmoLotInput) {
  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    label: input.label,
    caliber: input.caliber ?? null,
    quantity: input.quantity ?? null,
    purchasedOn: input.purchasedOn ?? null,
    isHandload: input.isHandload ? 1 : 0,
    brand: input.brand ?? null,
    product: input.product ?? null,
    lotNumber: input.lotNumber ?? null,
    bulletMake: input.bulletMake ?? null,
    bulletModel: input.bulletModel ?? null,
    bulletWeightGr: input.bulletWeightGr ?? null,
    velocityMps: input.velocityMps ?? null,
    powder: input.powder ?? null,
    powderChargeGr: input.powderChargeGr ?? null,
    primer: input.primer ?? null,
    brass: input.brass ?? null,
    colMm: input.colMm ?? null,
    crimpMm: input.crimpMm ?? null,
    notes: input.notes ?? null,
  };
  db.insert(ammoLots).values(row).run();
  return row;
}

export function getAmmoLot(db: Database, id: string) {
  return db
    .select()
    .from(ammoLots)
    .where(and(eq(ammoLots.id, id), isNull(ammoLots.deletedAt)))
    .get();
}

export function listAmmoLots(db: Database) {
  return db.select().from(ammoLots).where(isNull(ammoLots.deletedAt)).orderBy(ammoLots.label).all();
}

export type UpdateAmmoLotInput = Partial<CreateAmmoLotInput>;

export function updateAmmoLot(db: Database, id: string, patch: UpdateAmmoLotInput) {
  const now = nowIso();
  const values: Record<string, unknown> = { ...patch, updatedAt: now };
  if ('isHandload' in patch) values.isHandload = patch.isHandload ? 1 : 0;
  db.update(ammoLots)
    .set(values)
    .where(and(eq(ammoLots.id, id), isNull(ammoLots.deletedAt)))
    .run();
  return getAmmoLot(db, id);
}

export function softDeleteAmmoLot(db: Database, id: string) {
  const now = nowIso();
  db.update(ammoLots).set({ deletedAt: now, updatedAt: now }).where(eq(ammoLots.id, id)).run();
}

export type MergeAmmoLotsResult =
  { ok: true; moved: number } | { ok: false; error: 'sameLot' | 'unknownLot' };

/**
 * Merges a duplicate lot into the kept one (docs/specs/ammo-lot-merge-spec.md
 * M1–M3): every live session on the duplicate moves to the kept lot, then the
 * duplicate is soft-deleted. The kept lot's own row is not written (M2).
 */
export function mergeAmmoLots(
  db: Database,
  duplicateId: string,
  keptId: string,
): MergeAmmoLotsResult {
  if (duplicateId === keptId) return { ok: false, error: 'sameLot' };
  return db.transaction((tx): MergeAmmoLotsResult => {
    if (!getAmmoLot(tx, duplicateId) || !getAmmoLot(tx, keptId)) {
      return { ok: false, error: 'unknownLot' };
    }
    const onDuplicate = and(eq(sessions.ammoLotId, duplicateId), isNull(sessions.deletedAt));
    const moved = tx.select({ id: sessions.id }).from(sessions).where(onDuplicate).all().length;
    const now = nowIso();
    tx.update(sessions).set({ ammoLotId: keptId, updatedAt: now }).where(onDuplicate).run();
    tx.update(ammoLots)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(ammoLots.id, duplicateId))
      .run();
    return { ok: true, moved };
  });
}
