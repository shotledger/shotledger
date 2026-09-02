// Schema-compatibility check for restore (plan.md v2: "refuse a restore of
// a newer schema... migrate an older one"). Drizzle's own migrator tracks
// which migrations a database has applied in a table stored inside the
// database file itself, so a restored DB is brought up to date
// automatically by the existing migration gate on next launch — the only
// case that needs an explicit refusal is a bundle produced by a build with
// migrations this build doesn't have yet.
export type SchemaCompatibility = 'ok' | 'newer';

/**
 * @param manifestMigrationIdx Last migration index applied when the bundle
 * was exported (`BackupManifest.schemaMigrationIdx`).
 * @param appMigrationCount Number of migrations this build of the app knows
 * about (`migrations.journal.entries.length`).
 */
export function checkSchemaCompatibility(
  manifestMigrationIdx: number,
  appMigrationCount: number,
): SchemaCompatibility {
  return manifestMigrationIdx >= appMigrationCount ? 'newer' : 'ok';
}
