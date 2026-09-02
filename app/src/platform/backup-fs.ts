// Platform wrapper for backup export/import (plan.md v2 "Backup export/
// import"). Mirrors csv-export.ts/csv-import.ts's shape (expo-file-system +
// expo-sharing, no Android-only module, `File.pickFileAsync` instead of
// expo-document-picker — see csv-import.ts). Degrades to a no-op/null on
// web, where none of expo-sqlite/expo-file-system/expo-sharing has a usable
// native implementation.
//
// Everything here is IO primitives only (temp DB copies, byte read/write,
// share sheet, file picker). Assembling a bundle from the schema lives in
// app/src/db/backup/ — this module never imports drizzle or the schema.
import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const TMP_DIR_NAME = 'backup-tmp';
const COPY_DB_NAME = 'db-copy.sqlite3';
export const RESTORED_PHOTOS_DIR_NAME = 'backup-photos';
export const PRE_RESTORE_BACKUPS_DIR_NAME = 'pre-restore-backups';

function stripFileScheme(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

function toFileUri(barePath: string): string {
  return barePath.startsWith('file://') ? barePath : `file://${barePath}`;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * VACUUMs `liveDb` into a fresh temp copy and opens it as its own
 * connection, so export can rewrite photo paths / read counts without
 * touching the live database. Caller must call `cleanup()` when done —
 * it closes the copy connection and deletes the temp file.
 */
export async function vacuumIntoTempCopy(
  liveDb: SQLiteDatabase,
): Promise<{ copy: SQLiteDatabase; cleanup: () => void }> {
  const dir = new Directory(Paths.cache, TMP_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, COPY_DB_NAME);
  if (target.exists) target.delete();

  const bareTargetPath = stripFileScheme(target.uri);
  await liveDb.execAsync(`VACUUM INTO '${escapeSqlLiteral(bareTargetPath)}'`);

  const bareDirPath = stripFileScheme(dir.uri);
  const copy = openDatabaseSync(COPY_DB_NAME, {}, bareDirPath);

  return {
    copy,
    cleanup: () => {
      try {
        copy.closeSync();
      } catch {
        // already closed / never fully opened — nothing to do
      }
      try {
        if (target.exists) target.delete();
      } catch {
        // best-effort cleanup only
      }
    },
  };
}

/** Reads a photo's bytes from any URI expo-image-picker may have returned
 * (file:// or, on Android, an opaque content:// URI). `null` if unreadable —
 * export skips that photo rather than failing the whole bundle. */
export async function readPhotoBytes(uri: string): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return await file.bytes();
  } catch {
    return null;
  }
}

/** Writes `bytes` to a cache file and opens the native share sheet. */
export async function shareBundle(bytes: Uint8Array, filename: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/octet-stream',
      UTI: 'public.data',
    });
    return true;
  } catch {
    return false;
  }
}

/** Opens the file picker and returns the picked file's bytes, or `null` if
 * cancelled, unavailable (web), or unreadable. No expo-document-picker
 * dependency needed — see csv-import.ts. */
export async function pickBundleBytes(): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (Platform.OS === 'web') return null;
  try {
    const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
    if (picked.canceled) return null;
    const bytes = await picked.result.bytes();
    return { name: picked.result.name, bytes };
  } catch {
    return null;
  }
}

/** Writes bytes to an app-owned directory without sharing — used for the
 * automatic pre-restore backup. */
export function writeLocalBundleFile(dirName: string, bytes: Uint8Array, filename: string): void {
  const dir = new Directory(Paths.document, dirName);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
}

/** Closes the live DB connection so its file can be safely overwritten. */
export function closeLiveDatabase(liveDb: SQLiteDatabase): void {
  liveDb.closeSync();
}

/** Overwrites the live database file with `bytes`, clearing any leftover
 * WAL/SHM sidecar files from the closed connection first. `liveDb` must
 * already be closed (see closeLiveDatabase). */
export function replaceLiveDatabaseFile(liveDb: SQLiteDatabase, bytes: Uint8Array): void {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = new File(toFileUri(liveDb.databasePath + suffix));
    if (sidecar.exists) sidecar.delete();
  }
  const target = new File(toFileUri(liveDb.databasePath));
  if (target.exists) target.delete();
  target.create();
  target.write(bytes);
}

/** Writes restored photos into an app-owned directory and rewrites
 * `series.photo_uri` in the (already-restored, on-disk) database from the
 * bundle's relative path to the new absolute file:// URI, via a short-lived
 * connection to that same file. `liveDb` must already be closed. */
export async function restorePhotosAndRewritePaths(
  liveDb: SQLiteDatabase,
  databaseFilename: string,
  photos: readonly { entryName: string; filename: string; data: Uint8Array }[],
): Promise<void> {
  if (photos.length === 0) return;

  const photosDir = new Directory(Paths.document, RESTORED_PHOTOS_DIR_NAME);
  if (!photosDir.exists) photosDir.create({ intermediates: true, idempotent: true });

  const updates: { entryName: string; newUri: string }[] = [];
  for (const photo of photos) {
    const file = new File(photosDir, photo.filename);
    if (file.exists) file.delete();
    file.create();
    file.write(photo.data);
    updates.push({ entryName: photo.entryName, newUri: file.uri });
  }

  const barePath = stripFileScheme(liveDb.databasePath);
  const bareDbDir = barePath.slice(0, barePath.length - `/${databaseFilename}`.length);
  const conn = openDatabaseSync(databaseFilename, {}, bareDbDir);
  try {
    for (const u of updates) {
      await conn.runAsync('UPDATE series SET photo_uri = ? WHERE photo_uri = ?', [
        u.newUri,
        u.entryName,
      ]);
    }
  } finally {
    conn.closeSync();
  }
}
