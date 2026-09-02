// Glue layer (mirrors db/csv/build-export.ts): assembles a backup bundle
// (manifest.json + database.sqlite3 + optional photos/) from the live DB.
// Uses a VACUUM INTO'd copy throughout (plan.md v2: "never the live file"):
// the copy is what gets its photo_uri columns rewritten to relative bundle
// paths, counted for the manifest, and serialized into the bundle.
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
  photoEntryName,
} from '@shotledger/shared';

import { readPhotoBytes, vacuumIntoTempCopy } from '@/platform/backup-fs';

import journalMeta from '../migrations/meta/_journal.json';
import * as schema from '../schema';

type CountableTable =
  | typeof schema.firearms
  | typeof schema.licenses
  | typeof schema.ammoLots
  | typeof schema.sessions
  | typeof schema.series
  | typeof schema.shots
  | typeof schema.maintenanceEvents
  | typeof schema.tags;

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

/** Builds a `.shotledger` bundle (packed container bytes) from the live DB.
 * `kind: 'database'` includes only the VACUUM'd DB copy + manifest;
 * `'database+photos'` also copies every series photo into the bundle and
 * rewrites that copy's `photo_uri` columns to the relative bundle path
 * (`photos/<seriesId>.<ext>`) — the vault is never touched (plan.md v2: it
 * never leaves the device). */
export async function buildBackupBundle(
  liveDb: SQLiteDatabase,
  kind: BackupKind,
): Promise<Uint8Array> {
  const { copy, cleanup } = await vacuumIntoTempCopy(liveDb);
  try {
    const copyDb = drizzle(copy, { schema });

    const photoEntries: ContainerEntry[] = [];
    if (kind === 'database+photos') {
      const seriesWithPhotos = copyDb
        .select({ id: schema.series.id, photoUri: schema.series.photoUri })
        .from(schema.series)
        .where(isNull(schema.series.deletedAt))
        .all()
        .filter((s): s is { id: string; photoUri: string } => s.photoUri !== null);

      for (const s of seriesWithPhotos) {
        const bytes = await readPhotoBytes(s.photoUri);
        if (!bytes) continue; // unreadable/missing photo — skip rather than fail the whole export
        const entryName = photoEntryName(s.id, extensionFromUri(s.photoUri));
        photoEntries.push({ name: entryName, data: bytes });
        copyDb
          .update(schema.series)
          .set({ photoUri: entryName })
          .where(eq(schema.series.id, s.id))
          .run();
      }
    }

    const counts: BackupCounts = {
      firearms: countRows(copyDb, schema.firearms),
      licenses: countRows(copyDb, schema.licenses),
      ammoLots: countRows(copyDb, schema.ammoLots),
      sessions: countRows(copyDb, schema.sessions),
      series: countRows(copyDb, schema.series),
      shots: countRows(copyDb, schema.shots),
      maintenanceEvents: countRows(copyDb, schema.maintenanceEvents),
      tags: countRows(copyDb, schema.tags),
      photos: photoEntries.length,
    };

    const manifest = buildManifest(kind, counts);
    const dbBytes = await copy.serializeAsync();
    const encoder = new TextEncoder();

    return packContainer([
      { name: MANIFEST_ENTRY_NAME, data: encoder.encode(JSON.stringify(manifest, null, 2)) },
      { name: DATABASE_ENTRY_NAME, data: dbBytes },
      ...photoEntries,
    ]);
  } finally {
    cleanup();
  }
}
