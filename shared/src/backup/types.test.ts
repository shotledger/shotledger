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
});
