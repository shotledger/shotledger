import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  createFirearm,
  getFirearm,
  listFirearmOwnershipFacts,
  listFirearms,
  softDeleteFirearm,
  updateFirearm,
} from './firearms';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('createFirearm', () => {
  it('defaults round counters to 0', () => {
    const f = createFirearm(db, { make: 'Pardini', model: 'K22' });
    expect(f.roundCount).toBe(0);
    expect(f.roundsSinceMaintenance).toBe(0);
    expect(f.deletedAt).toBeNull();
  });
});

describe('listFirearms / softDeleteFirearm', () => {
  it('excludes tombstoned firearms from the list', () => {
    const a = createFirearm(db, { make: 'A', model: '1' });
    const b = createFirearm(db, { make: 'B', model: '2' });
    softDeleteFirearm(db, a.id);
    expect(listFirearms(db).map((f) => f.id)).toEqual([b.id]);
    expect(getFirearm(db, a.id)).toBeUndefined();
  });
});

describe('updateFirearm', () => {
  it('bumps updated_at and applies the patch', () => {
    const f = createFirearm(db, { make: 'A', model: '1' });
    const updated = updateFirearm(db, f.id, { notes: 'serviced' });
    expect(updated?.notes).toBe('serviced');
    expect(updated?.updatedAt).toBeTruthy();
  });
});

describe('isOwn (FAP 551-3 input, issue #286)', () => {
  it('Q1: is null until the shooter states it — never a fabricated true', () => {
    const f = createFirearm(db, { make: 'Pardini', model: 'K22' });
    expect(f.isOwn).toBeNull();
    expect(getFirearm(db, f.id)?.isOwn).toBeNull();
  });

  it('Q2: round-trips true and false', () => {
    const own = createFirearm(db, { make: 'A', model: '1', isOwn: true });
    const borrowed = createFirearm(db, { make: 'B', model: '2', isOwn: false });
    expect(getFirearm(db, own.id)?.isOwn).toBe(true);
    expect(getFirearm(db, borrowed.id)?.isOwn).toBe(false);
  });

  it('Q3: updateFirearm persists it without touching the other columns', () => {
    const f = createFirearm(db, { make: 'A', model: '1', caliber: '.22 LR', isOwn: true });
    updateFirearm(db, f.id, { isOwn: false });
    const after = getFirearm(db, f.id)!;
    expect(after.isOwn).toBe(false);
    expect(after.caliber).toBe('.22 LR');
    expect(after.make).toBe('A');
  });
});

describe('listFirearmOwnershipFacts', () => {
  it('Q4: one weapon-type/ownership pair per firearm', () => {
    createFirearm(db, { make: 'A', model: '1', weaponType: 'pistol', isOwn: true });
    createFirearm(db, { make: 'B', model: '2', weaponType: 'rifle', isOwn: false });
    createFirearm(db, { make: 'C', model: '3' });
    expect(listFirearmOwnershipFacts(db)).toEqual(
      expect.arrayContaining([
        { weaponType: 'pistol', isOwn: true },
        { weaponType: 'rifle', isOwn: false },
        { weaponType: null, isOwn: null },
      ]),
    );
    expect(listFirearmOwnershipFacts(db)).toHaveLength(3);
  });

  it('Q5: a soft-deleted firearm is not a fact about the shooter any more', () => {
    const gone = createFirearm(db, { make: 'A', model: '1', weaponType: 'pistol', isOwn: true });
    createFirearm(db, { make: 'B', model: '2', weaponType: 'rifle', isOwn: true });
    softDeleteFirearm(db, gone.id);
    expect(listFirearmOwnershipFacts(db)).toEqual([{ weaponType: 'rifle', isOwn: true }]);
  });
});
