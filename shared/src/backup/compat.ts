// Schema-compatibility check for restore. Before 1.0 the database baseline is
// reset rather than migrated (hard rule 8), so a bundle restores only onto
// the exact baseline it was exported from: an older one has tables the new
// baseline would be run over, a newer one columns this build lacks.
import type { BackupManifest } from './types';

export type SchemaCompatibility = 'ok' | 'mismatch';

/** A Drizzle journal entry, reduced to what identifies it. */
export interface MigrationIdentity {
  tag: string;
  when: number;
}

/** The journal's last migration — what an export records and a restore
 * compares against. */
export function latestMigration(journal: {
  entries: readonly MigrationIdentity[];
}): MigrationIdentity {
  const last = journal.entries[journal.entries.length - 1];
  if (!last) throw new Error('the migration journal has no entries');
  return { tag: last.tag, when: last.when };
}

export function checkSchemaCompatibility(
  manifest: Pick<BackupManifest, 'schemaMigrationTag' | 'schemaMigrationWhen'>,
  app: MigrationIdentity,
): SchemaCompatibility {
  return manifest.schemaMigrationTag === app.tag && manifest.schemaMigrationWhen === app.when
    ? 'ok'
    : 'mismatch';
}
