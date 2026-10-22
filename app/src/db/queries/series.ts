import { getProgram } from '@shotledger/shared';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { series, sessions } from '../schema';
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
  /**
   * Webshooter series-level-total granularity (integration spec §1/§A.4):
   * when true, no `shots` rows are ever created for this series and
   * totalOverrideTenths/totalOverrideShotCount must both be set.
   */
  isTotalOverride?: boolean;
  totalOverrideTenths?: number | null;
  totalOverrideShotCount?: number | null;
}

/**
 * A fixed-format session takes its program's skeleton as the truth about
 * sighters (§6.3) — Nationell helmatch lays out one before A and one before B
 * — so the one-sighter guard applies to freeform sessions only.
 */
function isFixedFormatSession(db: Database, sessionId: string): boolean {
  const row = db
    .select({ programId: sessions.programId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  const program = row?.programId ? getProgram(row.programId) : undefined;
  return program?.structure !== undefined;
}

/**
 * Adds a series to a session. Enforces §3/§6.3 in a freeform session: at
 * most one sighter (provskott) series per section — one in the main round,
 * one in the final (a final sighter has both isSighter and isFinal set).
 */
export function addSeries(db: Database, input: AddSeriesInput) {
  const isSighter = input.isSighter ?? false;
  const isFinal = input.isFinal ?? false;
  const isTotalOverride = input.isTotalOverride ?? false;

  if (isTotalOverride && isSighter) {
    // Overrides come from Webshooter results, which never report sighter
    // series (spec §A.7) — a caller mixing the two flags is a bug upstream.
    throw new RangeError('An override series cannot also be a sighter series.');
  }

  if (isSighter && !isFixedFormatSession(db, input.sessionId)) {
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
  patch: Partial<Pick<AddSeriesInput, 'photoUri'> & { photoGeometry: string | null }>,
) {
  const now = nowIso();
  db.update(series)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(series.id, id), isNull(series.deletedAt)))
    .run();
  return getSeries(db, id);
}

/**
 * Rewrites every live series' photo URI through `rewrite`, keeping the rows it
 * returns unchanged. Returns how many changed. At start-up this moves photos
 * saved into the picker's cache out of it (#652).
 */
export function rewriteSeriesPhotoUris(db: Database, rewrite: (uri: string) => string): number {
  const rows = db
    .select({ id: series.id, photoUri: series.photoUri })
    .from(series)
    .where(and(isNotNull(series.photoUri), isNull(series.deletedAt)))
    .all();
  let changed = 0;
  for (const row of rows) {
    if (row.photoUri === null) continue;
    const uri = rewrite(row.photoUri);
    if (uri === row.photoUri) continue;
    updateSeries(db, row.id, { photoUri: uri });
    changed += 1;
  }
  return changed;
}

/**
 * Sets or clears a series' sighter flag after creation (the sighter choice
 * moved from the add-series step onto the series entry screen).
 * Re-enforces the same one-sighter-per-section
 * rule as `addSeries`, in freeform sessions only; a series that already is the section's sighter can
 * always turn itself off. Returns `undefined` for an unknown/tombstoned id.
 */
export function setSeriesSighter(db: Database, id: string, isSighter: boolean) {
  const current = getSeries(db, id);
  if (!current) return undefined;

  if (isSighter && current.isTotalOverride === 1) {
    throw new RangeError('An override series cannot also be a sighter series.');
  }

  if (isSighter && current.isSighter !== 1 && !isFixedFormatSession(db, current.sessionId)) {
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

/**
 * Swaps two series' positions — the "move up/down" press (#138). Both rows
 * move in one transaction: a half-applied swap would leave two series sharing
 * a position, which every read path orders by.
 *
 * The caller decides *which* two (see features/session/series-move.ts); this
 * only performs the swap, and does nothing if either row has gone.
 */
export function swapSeriesPositions(db: Database, aId: string, bId: string) {
  const a = getSeries(db, aId);
  const b = getSeries(db, bId);
  if (!a || !b) return;

  const now = nowIso();
  db.transaction((tx) => {
    // Park one of them outside the used range first: `position` is unique per
    // session in practice and a direct A->B write would collide mid-swap.
    tx.update(series).set({ position: -1, updatedAt: now }).where(eq(series.id, a.id)).run();
    tx.update(series)
      .set({ position: a.position, updatedAt: now })
      .where(eq(series.id, b.id))
      .run();
    tx.update(series)
      .set({ position: b.position, updatedAt: now })
      .where(eq(series.id, a.id))
      .run();
  });
}

/**
 * Applies a whole reordering at once — the drag-and-drop equivalent of
 * `swapSeriesPositions`, which only ever exchanged two neighbors.
 *
 * Every row is parked outside the used range before any final value is
 * written. A swap could get away with parking one row; an arbitrary
 * permutation cannot, because any row's destination may still be occupied by
 * a row that has not moved yet. Negative ids keep the parked values clear of
 * every real position.
 *
 * Silently skips a row that has gone — the same tolerance `swapSeriesPositions`
 * has, for the same reason: a concurrent delete must not fail the reorder.
 */
export function setSeriesPositions(
  db: Database,
  positions: readonly { id: string; position: number }[],
): void {
  const live = positions.filter((next) => getSeries(db, next.id) !== undefined);
  if (live.length === 0) return;

  const now = nowIso();
  db.transaction((tx) => {
    live.forEach((next, index) => {
      tx.update(series)
        .set({ position: -(index + 1), updatedAt: now })
        .where(eq(series.id, next.id))
        .run();
    });
    for (const next of live) {
      tx.update(series)
        .set({ position: next.position, updatedAt: now })
        .where(eq(series.id, next.id))
        .run();
    }
  });
}
