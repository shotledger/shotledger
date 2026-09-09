import { CALIBER_PRESET_NAMES } from '@shotledger/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createAmmoLot, softDeleteAmmoLot } from './ammo-lots';
import { caliberUsageCounts, listCaliberOptions } from './caliber-usage';
import { createFirearm, softDeleteFirearm } from './firearms';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function names(limit: number) {
  return listCaliberOptions(db)
    .slice(0, limit)
    .map((option) => option.name);
}

describe('caliberUsageCounts', () => {
  it('counts each table separately and skips rows with no caliber', () => {
    createFirearm(db, { make: 'A', model: '1', caliber: '.22 LR' });
    createFirearm(db, { make: 'B', model: '2', caliber: '.22 LR' });
    createFirearm(db, { make: 'C', model: '3' });
    createAmmoLot(db, { label: 'Lot', caliber: '.22 LR' });

    expect(caliberUsageCounts(db).sort((a, b) => b.count - a.count)).toEqual([
      { caliber: '.22 LR', count: 2 },
      { caliber: '.22 LR', count: 1 },
    ]);
  });

  it('ignores tombstoned rows', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1', caliber: '9×19 mm' });
    const lot = createAmmoLot(db, { label: 'Lot', caliber: '9×19 mm' });
    softDeleteFirearm(db, firearm.id);
    softDeleteAmmoLot(db, lot.id);
    expect(caliberUsageCounts(db)).toEqual([]);
  });
});

describe('listCaliberOptions', () => {
  it('offers the whole vocabulary in curated order when nothing is stored', () => {
    const options = listCaliberOptions(db);
    expect(options.map((option) => option.name)).toEqual([...CALIBER_PRESET_NAMES]);
    expect(options.every((option) => option.count === 0 && option.isPreset)).toBe(true);
  });

  it('puts the calibers this shooter owns on top, most-used first', () => {
    createFirearm(db, { make: 'A', model: '1', caliber: '.38 Special' });
    createFirearm(db, { make: 'B', model: '2', caliber: '.22 LR' });
    createAmmoLot(db, { label: 'Lot 1', caliber: '.22 LR' });
    createAmmoLot(db, { label: 'Lot 2', caliber: '.22 LR' });

    expect(names(2)).toEqual(['.22 LR', '.38 Special']);
    expect(listCaliberOptions(db)).toHaveLength(CALIBER_PRESET_NAMES.length);
  });

  it('adds a caliber together across the two tables and across spellings', () => {
    createFirearm(db, { make: 'A', model: '1', caliber: '9mm Luger' });
    createAmmoLot(db, { label: 'Lot', caliber: '9×19 mm' });
    createFirearm(db, { make: 'B', model: '2', caliber: '.22 LR' });

    const [first] = listCaliberOptions(db);
    expect(first).toEqual({ name: '9×19 mm', count: 2, isPreset: true });
  });

  it('keeps a legacy value the vocabulary does not cover, flagged as such', () => {
    createFirearm(db, { make: 'A', model: '1', caliber: '.264 Wildcat' });

    const options = listCaliberOptions(db);
    expect(options[0]).toEqual({ name: '.264 Wildcat', count: 1, isPreset: false });
    expect(options).toHaveLength(CALIBER_PRESET_NAMES.length + 1);
  });
});
