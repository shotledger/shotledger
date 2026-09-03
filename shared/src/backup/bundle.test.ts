// End-to-end evidence for the bundle format itself (spec behaviours B1-B8):
// a bundle is assembled exactly as app/src/db/backup/export-bundle.ts
// assembles one, then read back exactly as restore-bundle.ts reads one. The
// app-side glue is thin IO around these bytes, so the failure cases that
// matter — wrong passphrase, truncation, a newer schema, an older bundle with
// no vault — are provable here without a device.
import { describe, expect, it } from 'vitest';

import { importWebCryptoKey, webCryptoProvider } from '../vault/webcrypto-provider';

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
import {
  BackupVaultPassphraseError,
  openVaultSection,
  sealVaultSection,
  VAULT_KDF_NAME,
  type VaultCryptoDeps,
} from './vault-crypt';
import { packVaultPayload, unpackVaultPayload, VAULT_ENTRY_NAME } from './vault-payload';

const deps: VaultCryptoDeps<CryptoKey> = {
  provider: webCryptoProvider,
  importRawKey: importWebCryptoKey,
};
const ITERATIONS = 1000;
const PASSPHRASE = 'a synthetic passphrase';

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

/** The vault payload an opt-in export would build: synthetic documents only. */
function syntheticVaultPayload() {
  return packVaultPayload({
    indexJson: JSON.stringify({
      documents: [
        {
          id: 'doc-1',
          kind: 'license',
          contentType: 'image',
          label: 'Synthetic licence card',
          addedAt: '2026-09-03T00:00:00.000Z',
        },
        {
          id: 'doc-2',
          kind: 'doorCode',
          contentType: 'text',
          label: 'Synthetic door code',
          addedAt: '2026-09-03T00:00:00.000Z',
        },
      ],
    }),
    documents: [
      { id: 'doc-1', bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) },
      { id: 'doc-2', bytes: new TextEncoder().encode('0000#') },
    ],
  });
}

async function buildBundle(options: { withVault: boolean; withPhotos: boolean }) {
  const payload = syntheticVaultPayload();
  const vault = options.withVault
    ? await sealVaultSection(payload, PASSPHRASE, deps, ITERATIONS)
    : null;

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
      ...(vault ? { vaultDocuments: 2 } : {}),
    },
    ...(vault
      ? {
          vault: {
            kdf: VAULT_KDF_NAME,
            saltHex: vault.saltHex,
            iterations: vault.iterations,
            documents: 2,
          },
        }
      : {}),
  };

  const bytes = packContainer([
    {
      name: MANIFEST_ENTRY_NAME,
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    },
    { name: DATABASE_ENTRY_NAME, data: DATABASE_BYTES },
    ...photoEntries,
    ...(vault ? [{ name: VAULT_ENTRY_NAME, data: vault.sealed }] : []),
  ]);

  return { bytes, manifest, payload };
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
  return {
    manifest: parsed.data,
    entries,
    vaultSection: entries.find((e) => e.name === VAULT_ENTRY_NAME)?.data ?? null,
  };
}

describe('backup bundle round trip', () => {
  it('B1: a default export carries the database and photos but no vault section', async () => {
    const { bytes } = await buildBundle({ withVault: false, withPhotos: true });
    const read = inspect(bytes);

    expect(read?.manifest.vault).toBeUndefined();
    expect(read?.vaultSection).toBeNull();
    expect(read?.entries.find((e) => e.name === DATABASE_ENTRY_NAME)?.data).toEqual(DATABASE_BYTES);
    expect(read?.entries.filter((e) => isPhotoEntryName(e.name))).toHaveLength(1);
    expect(read?.entries.filter((e) => isSyncPhotoEntryName(e.name))).toHaveLength(1);
  });

  it('B2: an opted-in vault opens with the right passphrase and yields the same documents', async () => {
    const { bytes, payload } = await buildBundle({ withVault: true, withPhotos: true });
    const read = inspect(bytes);
    const vault = read!.manifest.vault!;

    const opened = await openVaultSection(
      read!.vaultSection!,
      PASSPHRASE,
      vault.saltHex,
      vault.iterations,
      deps,
    );
    expect(unpackVaultPayload(opened)).toEqual(unpackVaultPayload(payload));
    expect(vault.documents).toBe(2);
  });

  it('B3: a wrong passphrase fails cleanly and leaves the rest of the bundle restorable', async () => {
    const { bytes } = await buildBundle({ withVault: true, withPhotos: true });
    const read = inspect(bytes);
    const vault = read!.manifest.vault!;

    await expect(
      openVaultSection(
        read!.vaultSection!,
        'not the passphrase',
        vault.saltHex,
        vault.iterations,
        deps,
      ),
    ).rejects.toBeInstanceOf(BackupVaultPassphraseError);

    // Everything a restore needs is still readable — the failure is confined
    // to the vault section.
    expect(read?.entries.find((e) => e.name === DATABASE_ENTRY_NAME)?.data).toEqual(DATABASE_BYTES);
    expect(read?.manifest.counts.sessions).toBe(30);
  });

  it('B4: a bundle written before the vault opt-in existed still inspects and restores', () => {
    // Byte-for-byte what the shipped format produced: no vault key in the
    // manifest, no vault entry, and none of the counts added since.
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
    expect(read?.manifest.vault).toBeUndefined();
    expect(read?.vaultSection).toBeNull();
    expect(read?.manifest.counts.syncPhotos).toBeUndefined();
    expect(checkSchemaCompatibility(read!.manifest.schemaMigrationIdx, 5)).toBe('ok');
  });

  it('B5: a truncated bundle is rejected as a container error, not silently half-read', async () => {
    const { bytes } = await buildBundle({ withVault: true, withPhotos: true });
    for (const cut of [4, 12, 40, bytes.length - 1]) {
      expect(() => unpackContainer(bytes.slice(0, cut)), `cut at ${cut}`).toThrow(
        InvalidContainerError,
      );
    }
  });

  it('B6: a bundle from a newer schema is refused before anything is written', async () => {
    const { bytes } = await buildBundle({ withVault: false, withPhotos: false });
    const read = inspect(bytes);
    // This build knows about fewer migrations than the bundle was made with.
    expect(checkSchemaCompatibility(read!.manifest.schemaMigrationIdx, 3)).toBe('newer');
    expect(checkSchemaCompatibility(read!.manifest.schemaMigrationIdx, 9)).toBe('ok');
  });

  it('B7: corrupting the vault section does not stop the database from being read', async () => {
    const { bytes, manifest } = await buildBundle({ withVault: true, withPhotos: false });
    const corrupted = Uint8Array.from(bytes);
    corrupted[corrupted.length - 5] = corrupted[corrupted.length - 5]! ^ 0xff;

    const read = inspect(corrupted);
    expect(read?.entries.find((e) => e.name === DATABASE_ENTRY_NAME)?.data).toEqual(DATABASE_BYTES);
    await expect(
      openVaultSection(
        read!.vaultSection!,
        PASSPHRASE,
        manifest.vault!.saltHex,
        manifest.vault!.iterations,
        deps,
      ),
    ).rejects.toBeInstanceOf(BackupVaultPassphraseError);
  });

  it('B8: the vault section holds no plaintext from the documents it carries', async () => {
    const { bytes } = await buildBundle({ withVault: true, withPhotos: false });
    const read = inspect(bytes);
    const haystack = new TextDecoder().decode(read!.vaultSection!);
    expect(haystack).not.toContain('Synthetic licence card');
    expect(haystack).not.toContain('0000#');
    // Nor anywhere else in the bundle.
    expect(new TextDecoder().decode(bytes)).not.toContain('Synthetic licence card');
  });
});
