import { and, eq, isNull } from 'drizzle-orm';

import { firearmGroups } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export interface AddFirearmGroupInput {
  firearmId: string;
  /** Federation-scoped group id, e.g. 'spsf:C' (§6.4a). */
  groupId: string;
  isDefaultForGroup?: boolean;
}

export function addFirearmGroup(db: Database, input: AddFirearmGroupInput) {
  const now = nowIso();
  if (input.isDefaultForGroup) {
    clearDefaultForGroup(db, input.groupId);
  }
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    firearmId: input.firearmId,
    groupId: input.groupId,
    isDefaultForGroup: input.isDefaultForGroup ? 1 : 0,
  };
  db.insert(firearmGroups).values(row).run();
  return row;
}

export function listFirearmGroups(db: Database, firearmId: string) {
  return db
    .select()
    .from(firearmGroups)
    .where(and(eq(firearmGroups.firearmId, firearmId), isNull(firearmGroups.deletedAt)))
    .all();
}

/** Distinct weapon-group ids the shooter holds across every firearm (M6 license-activity overview). */
export function listAllFirearmGroupIds(db: Database): string[] {
  const rows = db
    .select({ groupId: firearmGroups.groupId })
    .from(firearmGroups)
    .where(isNull(firearmGroups.deletedAt))
    .all();
  return [...new Set(rows.map((row) => row.groupId))];
}

/** The firearm currently marked default for a federation-scoped group id. */
export function getDefaultFirearmForGroup(db: Database, groupId: string) {
  return db
    .select()
    .from(firearmGroups)
    .where(
      and(
        eq(firearmGroups.groupId, groupId),
        eq(firearmGroups.isDefaultForGroup, 1),
        isNull(firearmGroups.deletedAt),
      ),
    )
    .get();
}

function clearDefaultForGroup(db: Database, groupId: string) {
  const now = nowIso();
  db.update(firearmGroups)
    .set({ isDefaultForGroup: 0, updatedAt: now })
    .where(
      and(
        eq(firearmGroups.groupId, groupId),
        eq(firearmGroups.isDefaultForGroup, 1),
        isNull(firearmGroups.deletedAt),
      ),
    )
    .run();
}

export function setDefaultFirearmGroup(db: Database, id: string) {
  const row = db.select().from(firearmGroups).where(eq(firearmGroups.id, id)).get();
  if (!row) return undefined;
  clearDefaultForGroup(db, row.groupId);
  const now = nowIso();
  db.update(firearmGroups)
    .set({ isDefaultForGroup: 1, updatedAt: now })
    .where(eq(firearmGroups.id, id))
    .run();
  return db.select().from(firearmGroups).where(eq(firearmGroups.id, id)).get();
}

export function softDeleteFirearmGroup(db: Database, id: string) {
  const now = nowIso();
  db.update(firearmGroups)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(firearmGroups.id, id))
    .run();
}
