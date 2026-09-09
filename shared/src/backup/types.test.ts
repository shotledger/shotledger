import { describe, expect, it } from 'vitest';

import { BACKUP_CONTAINER_FORMAT_VERSION, BackupManifestSchema } from './types';

function validManifest() {
  return {
    containerFormatVersion: BACKUP_CONTAINER_FORMAT_VERSION,
    appVersion: '1.0.0',
    schemaJournalVersion: '7',
    schemaMigrationTag: '0003_soft_hemingway',
    schemaMigrationIdx: 3,
    kind: 'database' as const,
    createdAt: '2026-09-02T10:00:00.000Z',
    counts: {
      firearms: 1,
      licenses: 0,
      ammoLots: 2,
      sessions: 5,
      series: 12,
      shots: 120,
      maintenanceEvents: 0,
      tags: 3,
      photos: 0,
    },
  };
}

describe('BackupManifestSchema', () => {
  it('accepts a well-formed manifest', () => {
    expect(BackupManifestSchema.safeParse(validManifest()).success).toBe(true);
  });

  it('accepts the database+photos kind', () => {
    const manifest = { ...validManifest(), kind: 'database+photos' };
    expect(BackupManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    const manifest = { ...validManifest(), kind: 'photos-only' };
    expect(BackupManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects a container format version other than the current one', () => {
    const manifest = { ...validManifest(), containerFormatVersion: 2 };
    expect(BackupManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects negative counts', () => {
    const manifest = { ...validManifest(), counts: { ...validManifest().counts, shots: -1 } };
    expect(BackupManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects a missing field', () => {
    const { appVersion: _appVersion, ...rest } = validManifest();
    expect(BackupManifestSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects extra garbage instead of a manifest object', () => {
    expect(BackupManifestSchema.safeParse('not a manifest').success).toBe(false);
    expect(BackupManifestSchema.safeParse(null).success).toBe(false);
  });

  // M1–M6: the vault section and the added counts were introduced after the
  // first bundles shipped, so both directions of compatibility are load-bearing.
  it('M1: still accepts a bundle written before the vault section existed', () => {
    const old = validManifest();
    expect('vault' in old).toBe(false);
    const parsed = BackupManifestSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.vault).toBeUndefined();
  });

  it('M2: accepts a manifest carrying a vault section', () => {
    const manifest = {
      ...validManifest(),
      vault: {
        kdf: 'pbkdf2-hmac-sha256',
        saltHex: '00112233445566778899aabbccddeeff',
        iterations: 150000,
        documents: 4,
      },
    };
    const parsed = BackupManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.vault?.iterations).toBe(150000);
  });

  it('M3: rejects a vault section with an unknown KDF, rather than guessing', () => {
    const manifest = {
      ...validManifest(),
      vault: { kdf: 'scrypt', saltHex: 'aabb', iterations: 1, documents: 0 },
    };
    expect(BackupManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('M4: rejects a non-hex salt or a non-positive iteration count', () => {
    const base = validManifest();
    for (const vault of [
      { kdf: 'pbkdf2-hmac-sha256', saltHex: 'zz', iterations: 10, documents: 0 },
      { kdf: 'pbkdf2-hmac-sha256', saltHex: 'AABB', iterations: 10, documents: 0 },
      { kdf: 'pbkdf2-hmac-sha256', saltHex: 'aabb', iterations: 0, documents: 0 },
      { kdf: 'pbkdf2-hmac-sha256', saltHex: 'aabb', iterations: 10, documents: -1 },
    ]) {
      expect(
        BackupManifestSchema.safeParse({ ...base, vault }).success,
        JSON.stringify(vault),
      ).toBe(false);
    }
  });

  it('M5: accepts the counts added alongside the vault, and their absence', () => {
    const base = validManifest();
    expect(BackupManifestSchema.safeParse(base).success).toBe(true);
    const withNewCounts = {
      ...base,
      counts: { ...base.counts, syncPhotos: 2, photosUnreadable: 1, vaultDocuments: 3 },
    };
    expect(BackupManifestSchema.safeParse(withNewCounts).success).toBe(true);
  });

  it('M6: ignores fields a newer build added, so a newer bundle still parses', () => {
    const fromTheFuture = { ...validManifest(), somethingNewer: { anything: true } };
    const parsed = BackupManifestSchema.safeParse(fromTheFuture);
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'somethingNewer' in parsed.data).toBe(false);
  });

  it('M7: accepts the sightSettings count added in issue #114, and its absence', () => {
    const base = validManifest();
    expect(BackupManifestSchema.safeParse(base).success).toBe(true);
    const withSightSettings = { ...base, counts: { ...base.counts, sightSettings: 2 } };
    expect(BackupManifestSchema.safeParse(withSightSettings).success).toBe(true);
  });
});
