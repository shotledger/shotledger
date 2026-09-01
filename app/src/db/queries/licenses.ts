import { and, desc, eq, isNull } from 'drizzle-orm';

import { licenses } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export interface AddLicenseInput {
  firearmId: string;
  licenseNumber?: string | null;
  purpose?: string | null;
  decidedOn?: string | null;
  validUntil?: string | null;
  conditions?: string | null;
  authority?: string | null;
}

/**
 * Appends a license row for a firearm. §3: one row per ISSUED license — a
 * renewal appends a new row rather than updating the old one, so history is
 * kept; expiry logic always keys off the latest row (see latestLicense).
 */
export function addLicense(db: Database, input: AddLicenseInput) {
  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    firearmId: input.firearmId,
    licenseNumber: input.licenseNumber ?? null,
    purpose: input.purpose ?? null,
    decidedOn: input.decidedOn ?? null,
    validUntil: input.validUntil ?? null,
    conditions: input.conditions ?? null,
    authority: input.authority ?? null,
  };
  db.insert(licenses).values(row).run();
  return row;
}

export function listLicenses(db: Database, firearmId: string) {
  return (
    db
      .select()
      .from(licenses)
      .where(and(eq(licenses.firearmId, firearmId), isNull(licenses.deletedAt)))
      // UUIDv7 ids are time-ordered with sub-millisecond precision (and a
      // monotonic counter within the same millisecond), so they're a more
      // reliable "latest" tiebreaker than created_at alone.
      .orderBy(desc(licenses.id))
      .all()
  );
}

/** Most recently issued (by created_at) non-deleted license for a firearm. */
export function latestLicense(db: Database, firearmId: string) {
  return (
    db
      .select()
      .from(licenses)
      .where(and(eq(licenses.firearmId, firearmId), isNull(licenses.deletedAt)))
      // UUIDv7 ids are time-ordered with sub-millisecond precision (and a
      // monotonic counter within the same millisecond), so they're a more
      // reliable "latest" tiebreaker than created_at alone.
      .orderBy(desc(licenses.id))
      .get()
  );
}

export function softDeleteLicense(db: Database, id: string) {
  const now = nowIso();
  db.update(licenses).set({ deletedAt: now, updatedAt: now }).where(eq(licenses.id, id)).run();
}
