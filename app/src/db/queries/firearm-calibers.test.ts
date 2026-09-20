import { beforeEach, describe, expect, it } from 'vitest';

import { createFirearm } from './firearms';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  addFirearmCaliber,
  firearmCaliberNames,
  listFirearmCalibers,
  softDeleteFirearmCaliber,
} from './firearm-calibers';

let db: Database;
let firearmId: string;

beforeEach(() => {
  db = createTestDb();
  // The maintainer's Manurhin 73S: chambered .357 Magnum, shot .38 Special
  // almost always. The case #312 was filed over.
  firearmId = createFirearm(db, {
    make: 'Manurhin',
    model: 'MR73 Sport',
    caliber: '.357 Magnum',
  }).id;
});

describe('addFirearmCaliber', () => {
  it('K1: adds a cartridge beyond the chambering', () => {
    const row = addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    expect(row.caliber).toBe('.38 Special');
    expect(listFirearmCalibers(db, firearmId)).toHaveLength(1);
  });

  it('K2: appends in order', () => {
    addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    addFirearmCaliber(db, { firearmId, caliber: '.357 Magnum' });
    expect(listFirearmCalibers(db, firearmId).map((r) => r.caliber)).toEqual([
      '.38 Special',
      '.357 Magnum',
    ]);
  });

  // The UI offers the same picker every time; a duplicate row would show the
  // shooter one cartridge twice with no way to tell which to remove.
  it('K3: re-adding the same caliber is a no-op, not a duplicate', () => {
    const first = addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    const second = addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    expect(second.id).toBe(first.id);
    expect(listFirearmCalibers(db, firearmId)).toHaveLength(1);
  });

  it('K4: the same caliber on a different firearm is its own row', () => {
    const other = createFirearm(db, { make: 'CZ', model: 'Shadow 2' }).id;
    addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    addFirearmCaliber(db, { firearmId: other, caliber: '.38 Special' });
    expect(listFirearmCalibers(db, other)).toHaveLength(1);
  });
});

describe('softDeleteFirearmCaliber', () => {
  it('K5: a removed caliber leaves the list and stays a tombstone', () => {
    const row = addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    softDeleteFirearmCaliber(db, row.id);
    expect(listFirearmCalibers(db, firearmId)).toHaveLength(0);
  });

  it('K6: removing one leaves the others', () => {
    const removed = addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    addFirearmCaliber(db, { firearmId, caliber: '.357 Magnum' });
    softDeleteFirearmCaliber(db, removed.id);
    expect(listFirearmCalibers(db, firearmId).map((r) => r.caliber)).toEqual(['.357 Magnum']);
  });

  it('K7: a removed caliber can be added back', () => {
    const row = addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    softDeleteFirearmCaliber(db, row.id);
    addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    expect(listFirearmCalibers(db, firearmId)).toHaveLength(1);
  });
});

describe('firearmCaliberNames', () => {
  it('K8: the chambering comes first, then the additional ones', () => {
    addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    expect(firearmCaliberNames(db, firearmId, '.357 Magnum')).toEqual([
      '.357 Magnum',
      '.38 Special',
    ]);
  });

  it('K9: the chambering is not repeated if it is also in the list', () => {
    addFirearmCaliber(db, { firearmId, caliber: '.357 Magnum' });
    expect(firearmCaliberNames(db, firearmId, '.357 Magnum')).toEqual(['.357 Magnum']);
  });

  it('K10: no chambering recorded yields just the additional ones', () => {
    addFirearmCaliber(db, { firearmId, caliber: '.38 Special' });
    expect(firearmCaliberNames(db, firearmId, null)).toEqual(['.38 Special']);
    expect(firearmCaliberNames(db, firearmId, '   ')).toEqual(['.38 Special']);
  });

  it('K11: a firearm with only a chambering still answers with it', () => {
    expect(firearmCaliberNames(db, firearmId, '.357 Magnum')).toEqual(['.357 Magnum']);
  });
});

describe('existing data (#312 migration)', () => {
  // The chosen shape keeps `firearms.caliber` as the chambering, so there is
  // no data migration at all — what a shooter typed is where they typed it.
  it('K12: a firearm that predates the table reads back unchanged', () => {
    const legacy = createFirearm(db, { make: 'FWB', model: 'AW93', caliber: '.22LR' });
    expect(listFirearmCalibers(db, legacy.id)).toEqual([]);
    expect(firearmCaliberNames(db, legacy.id, legacy.caliber)).toEqual(['.22LR']);
  });
});
