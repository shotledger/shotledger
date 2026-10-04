// End-to-end evidence for the bundle format itself (spec behaviors B1-B12):
// a bundle is assembled exactly as app/src/db/backup/export-bundle.ts
// assembles one, then read back through `readBundle`, which is what
// restore-bundle.ts calls. The app-side glue is thin IO around these bytes,
// so the failure cases that matter — truncation, a different schema baseline,
// an entry name that would escape the photos folder — are provable here
// without a device.
import { describe, expect, it } from 'vitest';

import { readBundle } from './bundle';
import { checkSchemaCompatibility } from './compat';
import {
  type ContainerEntry,
  InvalidContainerError,
  packContainer,
  unpackContainer,
} from './container';
import {
  isPhotoEntryName,
  isSyncPhotoEntryName,
  photoEntryName,
  syncPhotoEntryName,
} from './photo-path';
import {
  BACKUP_CONTAINER_FORMAT_VERSION,
  DATABASE_ENTRY_NAME,
  MANIFEST_ENTRY_NAME,
  type BackupManifest,
} from './types';

// Stand-in for the VACUUM'd SQLite copy — the bundle treats it as opaque bytes.
const DATABASE_BYTES = new TextEncoder().encode('SQLite format 3 (synthetic)');

// This build's migration journal, reduced to what the manifest carries.
const BASELINE = { tag: '0000_baseline', when: 1790148364655 };

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
    schemaMigrationTag: BASELINE.tag,
    schemaMigrationWhen: BASELINE.when,
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

function manifestEntry(manifest: unknown): ContainerEntry {
  return { name: MANIFEST_ENTRY_NAME, data: new TextEncoder().encode(JSON.stringify(manifest)) };
}

describe('backup bundle round trip', () => {
  it('B1: an export carries the database and photos', () => {
    const { bytes } = buildBundle({ withPhotos: true });
    const read = readBundle(bytes);

    expect(read?.entries.find((e) => e.name === DATABASE_ENTRY_NAME)?.data).toEqual(DATABASE_BYTES);
    expect(read?.entries.filter((e) => isPhotoEntryName(e.name))).toHaveLength(1);
    expect(read?.entries.filter((e) => isSyncPhotoEntryName(e.name))).toHaveLength(1);
  });

  it('B4: a bundle without the counts added since the first format still inspects and restores', () => {
    const legacyManifest = {
      containerFormatVersion: BACKUP_CONTAINER_FORMAT_VERSION,
      appVersion: '1.0.0',
      schemaJournalVersion: '7',
      schemaMigrationTag: BASELINE.tag,
      schemaMigrationWhen: BASELINE.when,
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

    const read = readBundle(legacy);
    expect(read).not.toBeNull();
    expect(read?.manifest.counts.syncPhotos).toBeUndefined();
    expect(checkSchemaCompatibility(read!.manifest, BASELINE)).toBe('ok');
  });

  it('B5: a truncated bundle is rejected as a container error, not silently half-read', () => {
    const { bytes } = buildBundle({ withPhotos: true });
    for (const cut of [4, 12, 40, bytes.length - 1]) {
      expect(() => unpackContainer(bytes.slice(0, cut)), `cut at ${cut}`).toThrow(
        InvalidContainerError,
      );
    }
  });

  it('B6: a bundle from a different schema baseline is refused before anything is written', () => {
    const { bytes } = buildBundle({ withPhotos: false });
    const read = readBundle(bytes);
    // The baseline was reset since: same tag, same index, different `when`.
    expect(checkSchemaCompatibility(read!.manifest, { ...BASELINE, when: BASELINE.when + 1 })).toBe(
      'mismatch',
    );
    expect(checkSchemaCompatibility(read!.manifest, BASELINE)).toBe('ok');
  });

  it('B9: a bundle carrying the removed Vault section still restores, section ignored', () => {
    // Issue #276 removed the Vault. A bundle exported by a build that still
    // had it carries a `vault` manifest key, `vaultDocuments` in the counts
    // and a `vault/payload.enc` entry; none of them may stop the restore.
    const withVaultManifest = {
      containerFormatVersion: BACKUP_CONTAINER_FORMAT_VERSION,
      appVersion: '1.0.0',
      schemaJournalVersion: '7',
      schemaMigrationTag: BASELINE.tag,
      schemaMigrationWhen: BASELINE.when,
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

    const read = readBundle(bundle);
    expect(read).not.toBeNull();
    expect(read?.entries.find((e) => e.name === DATABASE_ENTRY_NAME)?.data).toEqual(DATABASE_BYTES);
    expect(read?.entries.filter((e) => isPhotoEntryName(e.name))).toHaveLength(1);
    // Stripped by zod rather than rejected, and not carried forward.
    expect('vault' in read!.manifest).toBe(false);
    expect('vaultDocuments' in read!.manifest.counts).toBe(false);
  });

  it('B10: a bundle exported before the baseline identity was recorded is refused as invalid', () => {
    // What every bundle carried while the check compared an index.
    const { manifest } = buildBundle({ withPhotos: false });
    const { schemaMigrationWhen: _when, ...rest } = manifest;
    const preChange = packContainer([
      manifestEntry({ ...rest, schemaMigrationIdx: 0 }),
      { name: DATABASE_ENTRY_NAME, data: DATABASE_BYTES },
    ]);
    expect(readBundle(preChange)).toBeNull();
  });

  it.each([
    'photos/../x.jpg',
    'photos/a/b.jpg',
    'photos/',
    'sync-photos/../x.jpg',
    'sync-photos/../../pre-restore-backups/x.jpg',
  ])('B11: an entry named %j refuses the whole bundle before anything is written', (name) => {
    const { manifest } = buildBundle({ withPhotos: false });
    const hostile = packContainer([
      manifestEntry(manifest),
      { name: DATABASE_ENTRY_NAME, data: DATABASE_BYTES },
      { name, data: Uint8Array.from([1]) },
    ]);
    expect(readBundle(hostile)).toBeNull();
  });

  it('B12: a bundle the container itself refuses is invalid, not a crash', () => {
    const { bytes } = buildBundle({ withPhotos: true });
    const padded = new Uint8Array(bytes.length + 1);
    padded.set(bytes);
    expect(readBundle(padded)).toBeNull();
    expect(readBundle(bytes.slice(0, bytes.length - 1))).toBeNull();
  });
});

describe('readBundle', () => {
  it('returns the parsed manifest and every entry of a well-formed bundle', () => {
    const { bytes, manifest } = buildBundle({ withPhotos: true });
    const read = readBundle(bytes);
    expect(read?.manifest).toEqual(manifest);
    expect(read?.entries.map((e) => e.name)).toEqual([
      MANIFEST_ENTRY_NAME,
      DATABASE_ENTRY_NAME,
      'photos/series-1.jpg',
      'sync-photos/photo-9.jpg',
    ]);
  });

  it('is null without a manifest entry', () => {
    expect(readBundle(packContainer([{ name: DATABASE_ENTRY_NAME, data: DATABASE_BYTES }]))).toBe(
      null,
    );
  });

  it('finds the manifest wherever it sits among the entries', () => {
    const { manifest } = buildBundle({ withPhotos: false });
    const bundle = packContainer([
      { name: DATABASE_ENTRY_NAME, data: DATABASE_BYTES },
      manifestEntry(manifest),
    ]);
    expect(readBundle(bundle)?.manifest).toEqual(manifest);
  });

  it('is null when the manifest is not JSON', () => {
    const bundle = packContainer([
      { name: MANIFEST_ENTRY_NAME, data: new TextEncoder().encode('{not json') },
    ]);
    expect(readBundle(bundle)).toBeNull();
  });

  it('is null when the manifest is JSON of the wrong shape', () => {
    expect(readBundle(packContainer([manifestEntry({ kind: 'database' })]))).toBeNull();
  });
});
