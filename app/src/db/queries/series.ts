import { and, eq, isNull } from 'drizzle-orm';

import { series } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export class SighterLimitExceededError extends Error {
  constructor(section: 'main' | 'final') {
    super(`Section '${section}' already has a sighter series (max one per section).`);
    this.name = 'SighterLimitExceededError';
  }
}

export interface AddSeriesInput {
  sessionId: string;
  position: number;
  isSighter?: boolean;
  isFinal?: boolean;
  photoUri?: string | null;
  /** e.g. 'särskjutning' (integration spec §A.6). */
  note?: string | null;
  /**
   * WebShooter series-level-total granularity (integration spec §1/§A.4):
   * when true, no `shots` rows are ever created for this series and
   * totalOverrideTenths/totalOverrideShotCount must both be set.
   */
  isTotalOverride?: boolean;
  totalOverrideTenths?: number | null;
  totalOverrideShotCount?: number | null;
}

/**
 * Adds a series to a session. Enforces §3/§6.3: at most one sighter
 * (provskott) series per section — one in the main round, one in the final
 * (a final sighter has both isSighter and isFinal set).
 */
export function addSeries(db: Database, input: AddSeriesInput) {
  const isSighter = input.isSighter ?? false;
  const isFinal = input.isFinal ?? false;
  const isTotalOverride = input.isTotalOverride ?? false;

  if (isTotalOverride && isSighter) {
    // Overrides come from WebShooter results, which never report sighter
    // series (spec §A.7) — a caller mixing the two flags is a bug upstream.
    throw new RangeError('An override series cannot also be a sighter series.');
  }

  if (isSighter) {
    const existing = db
      .select()
      .from(series)
      .where(
        and(
          eq(series.sessionId, input.sessionId),
          eq(series.isSighter, 1),
          eq(series.isFinal, isFinal ? 1 : 0),
          isNull(series.deletedAt),
        ),
      )
      .get();
    if (existing) {
      throw new SighterLimitExceededError(isFinal ? 'final' : 'main');
    }
  }

  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    sessionId: input.sessionId,
    position: input.position,
    isSighter: isSighter ? 1 : 0,
    isFinal: isFinal ? 1 : 0,
    photoUri: input.photoUri ?? null,
    note: input.note ?? null,
    isTotalOverride: isTotalOverride ? 1 : 0,
    totalOverrideTenths: isTotalOverride ? (input.totalOverrideTenths ?? null) : null,
    totalOverrideShotCount: isTotalOverride ? (input.totalOverrideShotCount ?? null) : null,
  };
  db.insert(series).values(row).run();
  return row;
}

export function listSeriesForSession(db: Database, sessionId: string) {
  return db
    .select()
    .from(series)
    .where(and(eq(series.sessionId, sessionId), isNull(series.deletedAt)))
    .orderBy(series.position)
    .all();
}

export function getSeries(db: Database, id: string) {
  return db
    .select()
    .from(series)
    .where(and(eq(series.id, id), isNull(series.deletedAt)))
    .get();
}

export function updateSeries(
  db: Database,
  id: string,
  patch: Partial<Pick<AddSeriesInput, 'photoUri'>>,
) {
  const now = nowIso();
  db.update(series)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(series.id, id), isNull(series.deletedAt)))
    .run();
  return getSeries(db, id);
}

/**
 * Sets or clears a series' sighter flag after creation (the sighter choice
 * moved from the add-series step onto the series entry screen — plan.md
 * decisions log, 2026-09-03). Re-enforces the same one-sighter-per-section
 * rule as `addSeries`; a series that already is the section's sighter can
 * always turn itself off. Returns `undefined` for an unknown/tombstoned id.
 */
export function setSeriesSighter(db: Database, id: string, isSighter: boolean) {
  const current = getSeries(db, id);
  if (!current) return undefined;

  if (isSighter && current.isTotalOverride === 1) {
    throw new RangeError('An override series cannot also be a sighter series.');
  }

  if (isSighter && current.isSighter !== 1) {
    const existing = db
      .select()
      .from(series)
      .where(
        and(
          eq(series.sessionId, current.sessionId),
          eq(series.isSighter, 1),
          eq(series.isFinal, current.isFinal),
          isNull(series.deletedAt),
        ),
      )
      .get();
    if (existing && existing.id !== id) {
      throw new SighterLimitExceededError(current.isFinal === 1 ? 'final' : 'main');
    }
  }

  const now = nowIso();
  db.update(series)
    .set({ isSighter: isSighter ? 1 : 0, updatedAt: now })
    .where(and(eq(series.id, id), isNull(series.deletedAt)))
    .run();
  return getSeries(db, id);
}

export function softDeleteSeries(db: Database, id: string) {
  const now = nowIso();
  db.update(series).set({ deletedAt: now, updatedAt: now }).where(eq(series.id, id)).run();
}
