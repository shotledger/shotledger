// Glue layer (mirrors db/csv/build-export.ts): assembles a backup bundle
// (manifest.json + database.sqlite3 + optional photos/ and sync-photos/)
// from the live DB. Uses a VACUUM INTO'd copy throughout — never the live
// file: the copy is what gets its photo_uri columns rewritten to relative
// bundle paths, counted for the manifest, and serialized into the bundle.
//
// See docs/specs/backup-export-spec.md for what is deliberately left out
// (caches, pre-restore bundles, keystore secrets) and why.
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { eq, isNull, sql } from 'drizzle-orm';
import Constants from 'expo-constants';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  type BackupCounts,
  type BackupKind,
  type BackupManifest,
  BACKUP_CONTAINER_FORMAT_VERSION,
  type ContainerEntry,
  DATABASE_ENTRY_NAME,
  extensionFromUri,
  MANIFEST_ENTRY_NAME,
  packContainer,
  parseSyncPhotoUri,
  photoEntryName,
  syncPhotoEntryName,
} from '@shotledger/shared';

import { readPhotoBytes, readSyncPhotoBytes, vacuumIntoTempCopy } from '@/platform/backup-fs';

import journalMeta from '../migrations/meta/_journal.json';
import * as schema from '../schema';

export interface BuildBundleOptions {
  kind: BackupKind;
}

type CountableTable =
  | typeof schema.firearms
  | typeof schema.licenses
  | typeof schema.ammoLots
  | typeof schema.sessions
  | typeof schema.series
  | typeof schema.shots
  | typeof schema.maintenanceEvents
  | typeof schema.tags
  | typeof schema.sightSettings;

function countRows(copyDb: ReturnType<typeof drizzle>, table: CountableTable): number {
  const row = copyDb
    .select({ c: sql<number>`count(*)` })
    .from(table)
    .where(isNull(table.deletedAt))
    .get() as { c: number } | undefined;
  return row?.c ?? 0;
}

function buildManifest(kind: BackupKind, counts: BackupCounts): BackupManifest {
  const entries = journalMeta.entries;
  const lastEntry = entries[entries.length - 1];
  return {
    containerFormatVersion: BACKUP_CONTAINER_FORMAT_VERSION,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    schemaJournalVersion: journalMeta.version,
    schemaMigrationTag: lastEntry?.tag ?? 'unknown',
    schemaMigrationIdx: entries.length - 1,
    kind,
    createdAt: new Date().toISOString(),
    counts,
  };
}

interface PhotoCollection {
  entries: ContainerEntry[];
  syncPhotos: number;
  unreadable: number;
}

/**
 * Copies every series photo into the bundle. Two namespaces, because the two
 * kinds of `series.photo_uri` behave differently on restore:
 *
 * - a local path (camera roll, restored copy) becomes `photos/<seriesId>.<ext>`
 *   and the DB copy's column is rewritten to that bundle-relative name, so the
 *   restore is location-independent;
 * - a `shotledger-photo:<id>` sync marker becomes `sync-photos/<id>.jpg` and
 *   the column is left exactly as it is — the marker is the photo's identity
 *   across devices, and rewriting it would fork the photo away from the
 *   server's copy.
 */
async function collectPhotos(copyDb: ReturnType<typeof drizzle>): Promise<PhotoCollection> {
  const seriesWithPhotos = copyDb
    .select({ id: schema.series.id, photoUri: schema.series.photoUri })
    .from(schema.series)
    .where(isNull(schema.series.deletedAt))
    .all()
    .filter((s): s is { id: string; photoUri: string } => s.photoUri !== null);

  const entries: ContainerEntry[] = [];
  const seenSyncPhotoIds = new Set<string>();
  let syncPhotos = 0;
  let unreadable = 0;

  for (const s of seriesWithPhotos) {
    const syncPhotoId = parseSyncPhotoUri(s.photoUri);

    if (syncPhotoId !== null) {
      // One sync photo can back several series — store it once.
      if (seenSyncPhotoIds.has(syncPhotoId)) continue;
      const bytes = await readSyncPhotoBytes(syncPhotoId);
      if (!bytes) {
        // Not downloaded onto this device yet. The server still has it, so
        // this is a gap in the bundle, not lost data — count it and move on.
        unreadable++;
        continue;
      }
      seenSyncPhotoIds.add(syncPhotoId);
      entries.push({ name: syncPhotoEntryName(syncPhotoId), data: bytes });
      syncPhotos++;
      continue;
    }

    const bytes = await readPhotoBytes(s.photoUri);
    if (!bytes) {
      // Unreadable/missing local file — skip rather than fail the whole export.
      unreadable++;
      continue;
    }
    const entryName = photoEntryName(s.id, extensionFromUri(s.photoUri));
    entries.push({ name: entryName, data: bytes });
    copyDb
      .update(schema.series)
      .set({ photoUri: entryName })
      .where(eq(schema.series.id, s.id))
      .run();
  }

  return { entries, syncPhotos, unreadable };
}

/** Builds a `.shotledger` bundle (packed container bytes) from the live DB.
 * `kind: 'database'` includes only the VACUUM'd DB copy + manifest;
 * `'database+photos'` also copies every series photo (local and synced). */
export async function buildBackupBundle(
  liveDb: SQLiteDatabase,
  options: BuildBundleOptions,
): Promise<Uint8Array> {
  const { kind } = options;
  const { copy, cleanup } = await vacuumIntoTempCopy(liveDb);
  try {
    const copyDb = drizzle(copy, { schema });

    const photos: PhotoCollection =
      kind === 'database+photos'
        ? await collectPhotos(copyDb)
        : { entries: [], syncPhotos: 0, unreadable: 0 };

    const counts: BackupCounts = {
      firearms: countRows(copyDb, schema.firearms),
      licenses: countRows(copyDb, schema.licenses),
      ammoLots: countRows(copyDb, schema.ammoLots),
      sessions: countRows(copyDb, schema.sessions),
      series: countRows(copyDb, schema.series),
      shots: countRows(copyDb, schema.shots),
      maintenanceEvents: countRows(copyDb, schema.maintenanceEvents),
      tags: countRows(copyDb, schema.tags),
      sightSettings: countRows(copyDb, schema.sightSettings),
      photos: photos.entries.length,
      syncPhotos: photos.syncPhotos,
      photosUnreadable: photos.unreadable,
    };

    const manifest = buildManifest(kind, counts);
    const dbBytes = await copy.serializeAsync();
    const encoder = new TextEncoder();

    return packContainer([
      { name: MANIFEST_ENTRY_NAME, data: encoder.encode(JSON.stringify(manifest, null, 2)) },
      { name: DATABASE_ENTRY_NAME, data: dbBytes },
      ...photos.entries,
    ]);
  } finally {
    cleanup();
  }
}
