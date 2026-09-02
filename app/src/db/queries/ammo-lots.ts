import { and, eq, isNull } from 'drizzle-orm';

import { ammoLots } from '../schema';
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
