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

  // M1-M5 covered the Vault section the manifest used to carry. Issue #276
  // removed the Vault; what survives is that a bundle written by a build that
  // still had it must keep restoring, with the section quietly dropped.
  it('M1: accepts a manifest that still carries the removed vault section', () => {
    const manifest = {
      ...validManifest(),
      counts: { ...validManifest().counts, vaultDocuments: 4 },
      vault: {
        kdf: 'pbkdf2-hmac-sha256',
        saltHex: '00112233445566778899aabbccddeeff',
        iterations: 150000,
        documents: 4,
      },
    };
    const parsed = BackupManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'vault' in parsed.data).toBe(false);
    expect(parsed.success && 'vaultDocuments' in parsed.data.counts).toBe(false);
  });

  it('M5: accepts the counts added after the first bundles shipped, and their absence', () => {
    const base = validManifest();
    expect(BackupManifestSchema.safeParse(base).success).toBe(true);
    const withNewCounts = {
      ...base,
      counts: { ...base.counts, syncPhotos: 2, photosUnreadable: 1 },
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
