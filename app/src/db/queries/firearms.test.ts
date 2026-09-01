import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  createFirearm,
  getFirearm,
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
