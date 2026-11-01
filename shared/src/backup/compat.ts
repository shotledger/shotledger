// Schema-compatibility check for restore. A bundle from this build's schema or
// an earlier point in its migration chain restores (the restore migrates it
// forward); one this build's journal does not contain is from a newer build,
// or from before the chain was frozen, and is refused.
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
  journal: { entries: readonly MigrationIdentity[] },
): SchemaCompatibility {
  return journal.entries.some(
    (entry) =>
      entry.tag === manifest.schemaMigrationTag && entry.when === manifest.schemaMigrationWhen,
  )
    ? 'ok'
    : 'mismatch';
}
