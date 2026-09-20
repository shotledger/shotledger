// End-to-end evidence for the bundle format itself (spec behaviors B1-B8):
// a bundle is assembled exactly as app/src/db/backup/export-bundle.ts
// assembles one, then read back exactly as restore-bundle.ts reads one. The
// app-side glue is thin IO around these bytes, so the failure cases that
// matter — truncation, a newer schema, a bundle from an older build — are
// provable here without a device.
import { describe, expect, it } from 'vitest';

import { checkSchemaCompatibility } from './compat';
import { InvalidContainerError, packContainer, unpackContainer } from './container';
import {
  isPhotoEntryName,
  isSyncPhotoEntryName,
  photoEntryName,
  syncPhotoEntryName,
} from './photo-path';
import {
  BACKUP_CONTAINER_FORMAT_VERSION,
  BackupManifestSchema,
  DATABASE_ENTRY_NAME,
  MANIFEST_ENTRY_NAME,
  type BackupManifest,
} from './types';

// Stand-in for the VACUUM'd SQLite copy — the bundle treats it as opaque bytes.
const DATABASE_BYTES = new TextEncoder().encode('SQLite format 3 (synthetic)');

function baseCounts() {
  return {
    firearms: 2,
    licenses: 1,
    ammoLots: 3,
    sessions: 30,
    series: 216,
    shots: 1080,
    maintenanceEvents: 0,
    tags: 4,
    photos: 0,
  };
}

function buildBundle(options: { withPhotos: boolean }) {
  const photoEntries = options.withPhotos
    ? [
        { name: photoEntryName('series-1', '.jpg'), data: Uint8Array.from([1, 2, 3]) },
        { name: syncPhotoEntryName('photo-9'), data: Uint8Array.from([4, 5, 6]) },
      ]
    : [];

  const manifest: BackupManifest = {
    containerFormatVersion: BACKUP_CONTAINER_FORMAT_VERSION,
    appVersion: '1.0.0',
    schemaJournalVersion: '7',
    schemaMigrationTag: '0004_tag',
    schemaMigrationIdx: 4,
    kind: options.withPhotos ? 'database+photos' : 'database',
    createdAt: '2026-09-03T12:00:00.000Z',
    counts: {
      ...baseCounts(),
      photos: photoEntries.length,
      syncPhotos: options.withPhotos ? 1 : 0,
      photosUnreadable: 0,
    },
  };

  const bytes = packContainer([
    {
      name: MANIFEST_ENTRY_NAME,
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    },
    { name: DATABASE_ENTRY_NAME, data: DATABASE_BYTES },
    ...photoEntries,
  ]);

  return { bytes, manifest };
}

/** What `inspectBundle` does, minus the app's zod-to-status plumbing. */
function inspect(bytes: Uint8Array) {
  const entries = unpackContainer(bytes);
  const manifestEntry = entries.find((e) => e.name === MANIFEST_ENTRY_NAME);
  if (!manifestEntry) return null;
  const parsed = BackupManifestSchema.safeParse(
    JSON.parse(new TextDecoder().decode(manifestEntry.data)),
  );
  if (!parsed.success) return null;
  return { manifest: parsed.data, entries };
}

describe('backup bundle round trip', () => {
  it('B1: an export carries the database and photos', () => {
    const { bytes } = buildBundle({ withPhotos: true });
    const read = inspect(bytes);

    expect(read?.entries.find((e) => e.name === DATABASE_ENTRY_NAME)?.data).toEqual(DATABASE_BYTES);
    expect(read?.entries.filter((e) => isPhotoEntryName(e.name))).toHaveLength(1);
    expect(read?.entries.filter((e) => isSyncPhotoEntryName(e.name))).toHaveLength(1);
  });

  it('B4: a bundle written by an older build still inspects and restores', () => {
    // Byte-for-byte what the shipped format produced: none of the counts
    // added since.
    const legacyManifest = {
      containerFormatVersion: BACKUP_CONTAINER_FORMAT_VERSION,
      appVersion: '1.0.0',
      schemaJournalVersion: '7',
      schemaMigrationTag: '0003_soft_hemingway',
      schemaMigrationIdx: 3,
      kind: 'database+photos',
      createdAt: '2026-09-02T10:00:00.000Z',
      counts: baseCounts(),
    };
    const legacy = packContainer([
      {
        name: MANIFEST_ENTRY_NAME,
        data: new TextEncoder().encode(JSON.stringify(legacyManifest, null, 2)),
      },
      { name: DATABASE_ENTRY_NAME, data: DATABASE_BYTES },
      { name: photoEntryName('series-1', '.jpg'), data: Uint8Array.from([1, 2, 3]) },
    ]);

    const read = inspect(legacy);
    expect(read).not.toBeNull();
    expect(read?.manifest.counts.syncPhotos).toBeUndefined();
    expect(checkSchemaCompatibility(read!.manifest.schemaMigrationIdx, 5)).toBe('ok');
  });

  it('B5: a truncated bundle is rejected as a container error, not silently half-read', () => {
    const { bytes } = buildBundle({ withPhotos: true });
    for (const cut of [4, 12, 40, bytes.length - 1]) {
      expect(() => unpackContainer(bytes.slice(0, cut)), `cut at ${cut}`).toThrow(
        InvalidContainerError,
      );
    }
  });

  it('B6: a bundle from a newer schema is refused before anything is written', () => {
    const { bytes } = buildBundle({ withPhotos: false });
    const read = inspect(bytes);
    // This build knows about fewer migrations than the bundle was made with.
    expect(checkSchemaCompatibility(read!.manifest.schemaMigrationIdx, 3)).toBe('newer');
    expect(checkSchemaCompatibility(read!.manifest.schemaMigrationIdx, 9)).toBe('ok');
  });

  it('B9: a bundle carrying the removed Vault section still restores, section ignored', () => {
    // Issue #276 removed the Vault. A bundle exported by a build that still
    // had it carries a `vault` manifest key, `vaultDocuments` in the counts
    // and a `vault/payload.enc` entry; none of them may stop the restore.
    const withVaultManifest = {
      containerFormatVersion: BACKUP_CONTAINER_FORMAT_VERSION,
      appVersion: '1.0.0',
      schemaJournalVersion: '7',
      schemaMigrationTag: '0000_baseline',
      schemaMigrationIdx: 0,
      kind: 'database+photos',
      createdAt: '2026-09-10T10:00:00.000Z',
      counts: { ...baseCounts(), photos: 1, vaultDocuments: 3 },
      vault: {
        kdf: 'pbkdf2-hmac-sha256',
        saltHex: 'aabbccdd',
        iterations: 150000,
        documents: 3,
      },
    };
    const bundle = packContainer([
      {
        name: MANIFEST_ENTRY_NAME,
        data: new TextEncoder().encode(JSON.stringify(withVaultManifest, null, 2)),
      },
      { name: DATABASE_ENTRY_NAME, data: DATABASE_BYTES },
      { name: photoEntryName('series-1', '.jpg'), data: Uint8Array.from([1, 2, 3]) },
      { name: 'vault/payload.enc', data: Uint8Array.from([9, 9, 9, 9]) },
    ]);

    const read = inspect(bundle);
    expect(read).not.toBeNull();
    expect(read?.entries.find((e) => e.name === DATABASE_ENTRY_NAME)?.data).toEqual(DATABASE_BYTES);
    expect(read?.entries.filter((e) => isPhotoEntryName(e.name))).toHaveLength(1);
    // Stripped by zod rather than rejected, and not carried forward.
    expect('vault' in read!.manifest).toBe(false);
    expect('vaultDocuments' in read!.manifest.counts).toBe(false);
  });
});
