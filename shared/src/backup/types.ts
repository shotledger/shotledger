// Backup bundle manifest (plan.md v2 "Backup export/import"). Packed as
// `manifest.json` inside the container alongside `database.sqlite3` and,
// for the "database+photos" kind, `photos/<seriesId>.<ext>` entries.
import { z } from 'zod';

/** Bumped only if the container byte layout itself changes (see container.ts) —
 * independent of the app/schema versions carried inside the manifest. */
export const BACKUP_CONTAINER_FORMAT_VERSION = 1;

export const DATABASE_ENTRY_NAME = 'database.sqlite3';
export const MANIFEST_ENTRY_NAME = 'manifest.json';
export const PHOTOS_ENTRY_PREFIX = 'photos/';

export const BackupKindSchema = z.enum(['database', 'database+photos']);
export type BackupKind = z.infer<typeof BackupKindSchema>;

export const BackupCountsSchema = z.object({
  firearms: z.number().int().nonnegative(),
  licenses: z.number().int().nonnegative(),
  ammoLots: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  series: z.number().int().nonnegative(),
  shots: z.number().int().nonnegative(),
  maintenanceEvents: z.number().int().nonnegative(),
  tags: z.number().int().nonnegative(),
  photos: z.number().int().nonnegative(),
});
export type BackupCounts = z.infer<typeof BackupCountsSchema>;

export const BackupManifestSchema = z.object({
  containerFormatVersion: z.literal(BACKUP_CONTAINER_FORMAT_VERSION),
  appVersion: z.string(),
  // Drizzle journal bookkeeping (app/src/db/migrations/meta/_journal.json),
  // read at export time — lets a restore refuse a bundle whose schema is
  // newer than what this build of the app knows how to migrate.
  schemaJournalVersion: z.string(),
  schemaMigrationTag: z.string(),
  schemaMigrationIdx: z.number().int().nonnegative(),
  kind: BackupKindSchema,
  createdAt: z.string(),
  counts: BackupCountsSchema,
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;
