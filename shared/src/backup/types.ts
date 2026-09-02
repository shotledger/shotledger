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
/** Photos whose `series.photo_uri` is a `shotledger-photo:<id>` sync marker.
 * Kept separate from `photos/` because their path must NOT be rewritten —
 * restore drops the bytes into this device's sync-photo cache and leaves the
 * marker alone, so the series keeps its sync identity. */
export const SYNC_PHOTOS_ENTRY_PREFIX = 'sync-photos/';

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
  // Added after the first shipped bundle format, hence optional: a bundle
  // written by an older build has neither field and must still validate.
  /** Photos stored under `sync-photos/` (synced series). Included in `photos`. */
  syncPhotos: z.number().int().nonnegative().optional(),
  /** Series photos whose source file could no longer be read at export time. */
  photosUnreadable: z.number().int().nonnegative().optional(),
  /** Vault documents in the bundle's vault section, when one is present. */
  vaultDocuments: z.number().int().nonnegative().optional(),
});
export type BackupCounts = z.infer<typeof BackupCountsSchema>;

/** Present only when the user explicitly opted the vault into this bundle.
 * Records how to re-derive the key from their passphrase — never the
 * passphrase, and never the device's own vault key. */
export const BackupVaultSectionSchema = z.object({
  kdf: z.literal('pbkdf2-hmac-sha256'),
  saltHex: z.string().regex(/^[0-9a-f]+$/),
  iterations: z.number().int().positive(),
  documents: z.number().int().nonnegative(),
});
export type BackupVaultSection = z.infer<typeof BackupVaultSectionSchema>;

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
  // Optional so bundles written before the vault opt-in still validate, and
  // so a build without this field simply ignores the section it can't use.
  vault: BackupVaultSectionSchema.optional(),
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;
