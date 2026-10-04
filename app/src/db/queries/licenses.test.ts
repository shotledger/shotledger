import { beforeEach, describe, expect, it } from 'vitest';

import { createFirearm } from './firearms';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { addLicense, latestLicense, listLicenses, softDeleteLicense } from './licenses';

let db: Database;
let firearmId: string;

beforeEach(() => {
  db = createTestDb();
  firearmId = createFirearm(db, { make: 'A', model: '1' }).id;
});

describe('addLicense / latestLicense', () => {
  it('a renewal appends a new row rather than replacing the old one', () => {
    const original = addLicense(db, {
      firearmId,
      licenseNumber: 'A1',
      validUntil: '2027-01-01',
    });
    const renewal = addLicense(db, {
      firearmId,
      licenseNumber: 'A2',
      validUntil: '2029-01-01',
    });
    expect(listLicenses(db, firearmId)).toHaveLength(2);
    expect(latestLicense(db, firearmId)?.id).toBe(renewal.id);
    void original;
  });

  it('latestLicense ignores tombstoned rows', () => {
    const original = addLicense(db, { firearmId, licenseNumber: 'A1' });
    const renewal = addLicense(db, { firearmId, licenseNumber: 'A2' });
    softDeleteLicense(db, renewal.id);
    expect(latestLicense(db, firearmId)?.id).toBe(original.id);
  });

  it('scopes to the given firearm', () => {
    const other = createFirearm(db, { make: 'B', model: '2' }).id;
    addLicense(db, { firearmId: other, licenseNumber: 'X' });
    const mine = addLicense(db, { firearmId, licenseNumber: 'A1' });
    expect(latestLicense(db, firearmId)?.id).toBe(mine.id);
  });
});
