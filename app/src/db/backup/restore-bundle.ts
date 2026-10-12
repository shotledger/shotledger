// Glue layer for restore (mirrors export-bundle.ts). Restore is a full
// replace, never a merge: validate the bundle, write an automatic
// pre-restore backup, close the live connection, overwrite the DB file, reset
// its sync bookkeeping, then restore any bundled photos and rewrite their paths. A bundle from any other
// schema baseline than this build's is refused (`checkSchemaCompatibility`).
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  type BackupManifest,
  checkSchemaCompatibility,
  DATABASE_ENTRY_NAME,
  isPhotoEntryName,
  isSyncPhotoEntryName,
  latestMigration,
  photoEntryFilename,
  readBundle,
  type SchemaCompatibility,
  syncPhotoEntryId,
} from '@shotledger/shared';

import {
  PRE_RESTORE_BACKUPS_DIR_NAME,
  closeLiveDatabase,
  openDatabaseFile,
  replaceLiveDatabaseFile,
  restorePhotosAndRewritePaths,
  restoreSyncPhotos,
  writeLocalBundleFile,
} from '@/platform/backup-fs';

import { DATABASE_FILENAME } from '../client';
import journalMeta from '../migrations/meta/_journal.json';
import { resetSyncBookkeeping } from '../queries/sync-store';
import * as schema from '../schema';
import { buildBackupBundle } from './export-bundle';

export interface RestorePreview {
  manifest: BackupManifest;
  compatibility: SchemaCompatibility;
}

/** Parses and validates a picked bundle without touching the DB or disk.
 * `null` means the bundle is unreadable / not a ShotLedger backup. */
export function inspectBundle(bytes: Uint8Array): RestorePreview | null {
  const bundle = readBundle(bytes);
  if (!bundle) return null;
  const compatibility = checkSchemaCompatibility(bundle.manifest, latestMigration(journalMeta));
  return { manifest: bundle.manifest, compatibility };
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
  // Re-validated here too: these bytes are what gets written, whatever the
  // caller inspected.
  const bundle = readBundle(bytes);
  if (!bundle) return false;
  if (checkSchemaCompatibility(bundle.manifest, latestMigration(journalMeta)) !== 'ok') {
    return false;
  }
  const { entries } = bundle;
  const dbEntry = entries.find((e) => e.name === DATABASE_ENTRY_NAME);
  if (!dbEntry) return false;
  const photoEntries = entries
    .filter((e) => isPhotoEntryName(e.name))
    .map((e) => ({ entryName: e.name, filename: photoEntryFilename(e.name), data: e.data }));
  // Synced photos go back into this device's sync-photo cache under their own
  // id; their `shotledger-photo:<id>` markers in the restored database are
  // already correct and must not be rewritten.
  const syncPhotoEntries = entries
    .filter((e) => isSyncPhotoEntryName(e.name))
    .map((e) => ({ photoId: syncPhotoEntryId(e.name), data: e.data }));

  const preRestoreBundle = await buildBackupBundle(liveDb, { kind: 'database' });
  writeLocalBundleFile(PRE_RESTORE_BACKUPS_DIR_NAME, preRestoreBundle, preRestoreBackupFilename());

  closeLiveDatabase(liveDb);
  replaceLiveDatabaseFile(liveDb, dbEntry.data);
  // Also covers a bundle written before export stripped this: the next sync
  // re-pulls from cursor 0 and replays nothing.
  const restored = openDatabaseFile(liveDb, DATABASE_FILENAME);
  try {
    resetSyncBookkeeping(drizzle(restored, { schema }));
  } finally {
    restored.closeSync();
  }
  await restorePhotosAndRewritePaths(liveDb, DATABASE_FILENAME, photoEntries);
  restoreSyncPhotos(syncPhotoEntries);

  return true;
}
