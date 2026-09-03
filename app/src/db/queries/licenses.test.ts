import { beforeEach, describe, expect, it } from 'vitest';

import { createFirearm } from './firearms';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  addLicense,
  latestLicense,
  listLicenses,
  setLicenseVaultDocument,
  softDeleteLicense,
} from './licenses';

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
      validUntil: '2027-01-01T00:00:00.000Z',
    });
    const renewal = addLicense(db, {
      firearmId,
      licenseNumber: 'A2',
      validUntil: '2029-01-01T00:00:00.000Z',
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

  it('defaults vaultDocumentId to null when not given', () => {
    const license = addLicense(db, { firearmId, licenseNumber: 'A1' });
    expect(license.vaultDocumentId).toBeNull();
  });

  it('accepts a vaultDocumentId at creation', () => {
    const license = addLicense(db, { firearmId, licenseNumber: 'A1', vaultDocumentId: 'doc-1' });
    expect(license.vaultDocumentId).toBe('doc-1');
    expect(latestLicense(db, firearmId)?.vaultDocumentId).toBe('doc-1');
  });
});

describe('setLicenseVaultDocument', () => {
  it('links a vault document to an existing license', () => {
    const license = addLicense(db, { firearmId, licenseNumber: 'A1' });
    setLicenseVaultDocument(db, license.id, 'doc-2');
    expect(latestLicense(db, firearmId)?.vaultDocumentId).toBe('doc-2');
  });

  it('can clear the link', () => {
    const license = addLicense(db, { firearmId, licenseNumber: 'A1', vaultDocumentId: 'doc-1' });
    setLicenseVaultDocument(db, license.id, null);
    expect(latestLicense(db, firearmId)?.vaultDocumentId).toBeNull();
  });
});
