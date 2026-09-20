// Additional cartridges a firearm may be fed, beyond the chambering held in
// `firearms.caliber` (#312).
import { and, asc, eq, isNull } from 'drizzle-orm';

import { firearmCalibers } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export interface AddFirearmCaliberInput {
  firearmId: string;
  /** Canonical spelling from shared/src/calibers/presets.ts. */
  caliber: string;
}

export function listFirearmCalibers(db: Database, firearmId: string) {
  return db
    .select()
    .from(firearmCalibers)
    .where(and(eq(firearmCalibers.firearmId, firearmId), isNull(firearmCalibers.deletedAt)))
    .orderBy(asc(firearmCalibers.position))
    .all();
}

/**
 * Appends a caliber, unless the firearm already lists it.
 *
 * Re-adding is a no-op rather than an error: the UI offers the same picker
 * every time, and a duplicate row would show the shooter the same cartridge
 * twice with no way to tell which to remove.
 */
export function addFirearmCaliber(db: Database, input: AddFirearmCaliberInput) {
  const existing = listFirearmCalibers(db, input.firearmId);
  const already = existing.find((row) => row.caliber === input.caliber);
  if (already) return already;

  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    firearmId: input.firearmId,
    caliber: input.caliber,
    position: existing.length,
  };
  db.insert(firearmCalibers).values(row).run();
  return row;
}

export function softDeleteFirearmCaliber(db: Database, id: string) {
  const now = nowIso();
  db.update(firearmCalibers)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(firearmCalibers.id, id))
    .run();
}

/**
 * Every cartridge this firearm can be fed: the chambering first, then the
 * additional ones, with no duplicate if the chambering was also added to the
 * list.
 *
 * This is the read most callers want — "what does this gun shoot" — and
 * keeping it in one place stops each screen re-deciding whether the
 * chambering belongs in the answer.
 */
export function firearmCaliberNames(
  db: Database,
  firearmId: string,
  chambering: string | null,
): string[] {
  const additional = listFirearmCalibers(db, firearmId).map((row) => row.caliber);
  const names = chambering?.trim() ? [chambering, ...additional] : additional;
  return [...new Set(names)];
}
