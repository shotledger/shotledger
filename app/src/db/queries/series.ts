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
}

/**
 * Adds a series to a session. Enforces §3/§6.3: at most one sighter
 * (provskott) series per section — one in the main round, one in the final
 * (a final sighter has both isSighter and isFinal set).
 */
export function addSeries(db: Database, input: AddSeriesInput) {
  const isSighter = input.isSighter ?? false;
  const isFinal = input.isFinal ?? false;

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

export function softDeleteSeries(db: Database, id: string) {
  const now = nowIso();
  db.update(series).set({ deletedAt: now, updatedAt: now }).where(eq(series.id, id)).run();
}
