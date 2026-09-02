// Glue layer for restore (mirrors export-bundle.ts). Restore is a full
// replace, never a merge (plan.md v2): validate the manifest, write an
// automatic pre-restore backup, close the live connection, overwrite the DB
// file, then restore any bundled photos and rewrite their paths. The
// existing migration gate (db/migration-gate.tsx) brings an older-schema
// restore up to date automatically on the next app launch — this module
// only needs to refuse a bundle newer than what this build understands.
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  type BackupManifest,
  BackupManifestSchema,
  checkSchemaCompatibility,
  DATABASE_ENTRY_NAME,
  isPhotoEntryName,
  MANIFEST_ENTRY_NAME,
  photoEntryFilename,
  type SchemaCompatibility,
  unpackContainer,
} from '@shotledger/shared';

import {
  PRE_RESTORE_BACKUPS_DIR_NAME,
  closeLiveDatabase,
  replaceLiveDatabaseFile,
  restorePhotosAndRewritePaths,
  writeLocalBundleFile,
} from '@/platform/backup-fs';

import { DATABASE_FILENAME } from '../client';
import journalMeta from '../migrations/meta/_journal.json';
import { buildBackupBundle } from './export-bundle';

export interface RestorePreview {
  manifest: BackupManifest;
  compatibility: SchemaCompatibility;
}

/** Parses and validates a picked bundle's manifest without touching the DB.
 * `null` means the bundle is unreadable / not a ShotLedger backup. */
export function inspectBundle(bytes: Uint8Array): RestorePreview | null {
  let entries;
  try {
    entries = unpackContainer(bytes);
  } catch {
    return null;
  }
  const manifestEntry = entries.find((e) => e.name === MANIFEST_ENTRY_NAME);
  if (!manifestEntry) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(manifestEntry.data));
  } catch {
    return null;
  }
  const result = BackupManifestSchema.safeParse(parsed);
  if (!result.success) return null;

  const compatibility = checkSchemaCompatibility(
    result.data.schemaMigrationIdx,
    journalMeta.entries.length,
  );
  return { manifest: result.data, compatibility };
}

function preRestoreBackupFilename(): string {
  return `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.shotledger`;
}

/** Replaces the entire live database (and, for a database+photos bundle,
 * restores its photos) with the contents of `bytes`. Caller must have
 * already validated the bundle via `inspectBundle` and confirmed with the
 * user. Writes an automatic pre-restore backup first. Requires a full app
 * restart afterwards — see the "restart required" status the calling hook
 * surfaces (this module cannot reopen the closed `db` singleton itself). */
export async function restoreBundle(liveDb: SQLiteDatabase, bytes: Uint8Array): Promise<boolean> {
  const entries = unpackContainer(bytes);
  const dbEntry = entries.find((e) => e.name === DATABASE_ENTRY_NAME);
  if (!dbEntry) return false;
  const photoEntries = entries
    .filter((e) => isPhotoEntryName(e.name))
    .map((e) => ({ entryName: e.name, filename: photoEntryFilename(e.name), data: e.data }));

  const preRestoreBundle = await buildBackupBundle(liveDb, 'database');
  writeLocalBundleFile(PRE_RESTORE_BACKUPS_DIR_NAME, preRestoreBundle, preRestoreBackupFilename());

  closeLiveDatabase(liveDb);
  replaceLiveDatabaseFile(liveDb, dbEntry.data);
  await restorePhotosAndRewritePaths(liveDb, DATABASE_FILENAME, photoEntries);

  return true;
}
