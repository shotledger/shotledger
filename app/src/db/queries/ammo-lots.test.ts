import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  createAmmoLot,
  getAmmoLot,
  listAmmoLots,
  softDeleteAmmoLot,
  updateAmmoLot,
} from './ammo-lots';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('createAmmoLot', () => {
  it('stores factory-ammo fields', () => {
    const lot = createAmmoLot(db, {
      label: 'SK Standard Plus',
      caliber: '.22 LR',
      brand: 'SK',
      product: 'Standard Plus',
      lotNumber: 'L2024-08',
    });
    expect(lot.isHandload).toBe(0);
    expect(lot.brand).toBe('SK');
  });

  it('stores handload recipe fields', () => {
    const lot = createAmmoLot(db, {
      label: '.32 wadcutter',
      isHandload: true,
      powder: 'Vihtavuori N320',
      powderChargeGr: 1.8,
      colMm: 31.75,
    });
    expect(lot.isHandload).toBe(1);
    expect(lot.powder).toBe('Vihtavuori N320');
    expect(lot.powderChargeGr).toBe(1.8);
    expect(lot.colMm).toBe(31.75);
  });
});

describe('listAmmoLots / softDeleteAmmoLot', () => {
  it('excludes tombstoned lots', () => {
    const a = createAmmoLot(db, { label: 'A' });
    const b = createAmmoLot(db, { label: 'B' });
    softDeleteAmmoLot(db, a.id);
    expect(listAmmoLots(db).map((l) => l.id)).toEqual([b.id]);
    expect(getAmmoLot(db, a.id)).toBeUndefined();
  });
});

describe('updateAmmoLot', () => {
  it('bumps updated_at and applies the patch', () => {
    const lot = createAmmoLot(db, { label: 'A' });
    const updated = updateAmmoLot(db, lot.id, { quantity: 42 });
    expect(updated?.quantity).toBe(42);
    expect(updated?.updatedAt).toBeTruthy();
  });
});
