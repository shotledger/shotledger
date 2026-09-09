import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import { sightSettings } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export interface CreateSightSettingInput {
  firearmId: string;
  label: string;
  elevationClicks?: number | null;
  windageClicks?: number | null;
  notes?: string | null;
  makeActive?: boolean;
}

/** Creates a sight setting; `makeActive` also clears the flag on the
 * firearm's other settings, in the same transaction. Returns the new id. */
export function createSightSetting(db: Database, input: CreateSightSettingInput): string {
  const id = newId();
  const now = nowIso();
  const makeActive = input.makeActive ?? false;
  db.transaction((tx) => {
    const inner = tx as unknown as Database;
    inner
      .insert(sightSettings)
      .values({
        id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        firearmId: input.firearmId,
        label: input.label,
        elevationClicks: input.elevationClicks ?? null,
        windageClicks: input.windageClicks ?? null,
        isActive: makeActive ? 1 : 0,
        notes: input.notes ?? null,
      })
      .run();
    if (makeActive) {
      inner
        .update(sightSettings)
        .set({ isActive: 0, updatedAt: now })
        .where(
          and(
            eq(sightSettings.firearmId, input.firearmId),
            eq(sightSettings.isActive, 1),
            ne(sightSettings.id, id),
          ),
        )
        .run();
    }
  });
  return id;
}

/** Oldest-first (creation order via the UUIDv7 id) so the list stays stable
 * across edits — see maintenance-events.ts for the same id-ordering convention. */
export function listSightSettings(db: Database, firearmId: string) {
  return db
    .select()
    .from(sightSettings)
    .where(and(eq(sightSettings.firearmId, firearmId), isNull(sightSettings.deletedAt)))
    .orderBy(asc(sightSettings.id))
    .all();
}

export interface UpdateSightSettingInput {
  label?: string;
  elevationClicks?: number | null;
  windageClicks?: number | null;
  notes?: string | null;
}

export function updateSightSetting(db: Database, id: string, patch: UpdateSightSettingInput) {
  const now = nowIso();
  db.update(sightSettings)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(sightSettings.id, id), isNull(sightSettings.deletedAt)))
    .run();
}

/** Exclusive per firearm: sets `id` active and clears every other row for
 * that firearm, in one transaction. `id: null` clears all of them. Only
 * rows that actually change get their updated_at bumped, so the sync
 * outbox enqueues exactly the rows that changed. */
export function setActiveSightSetting(db: Database, firearmId: string, id: string | null) {
  const now = nowIso();
  db.transaction((tx) => {
    const inner = tx as unknown as Database;
    if (id !== null) {
      inner
        .update(sightSettings)
        .set({ isActive: 1, updatedAt: now })
        .where(
          and(
            eq(sightSettings.id, id),
            eq(sightSettings.firearmId, firearmId),
            eq(sightSettings.isActive, 0),
          ),
        )
        .run();
    }
    const clearWhere =
      id !== null
        ? and(
            eq(sightSettings.firearmId, firearmId),
            eq(sightSettings.isActive, 1),
            ne(sightSettings.id, id),
          )
        : and(eq(sightSettings.firearmId, firearmId), eq(sightSettings.isActive, 1));
    inner.update(sightSettings).set({ isActive: 0, updatedAt: now }).where(clearWhere).run();
  });
}

export function softDeleteSightSetting(db: Database, id: string) {
  const now = nowIso();
  db.update(sightSettings)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(sightSettings.id, id))
    .run();
}
