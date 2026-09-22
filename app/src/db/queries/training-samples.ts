// The opt-in label store behind a future learned hole detector.
// Schema rationale: see `trainingSamples` in ../schema.ts.
//
// Nothing here runs unless the shooter has turned the Settings opt-in on; the
// caller checks that, and `recordTrainingSample` is simply never reached
// otherwise. That is deliberate — a consent check buried inside a write is
// easy to bypass by accident from a new call site, whereas a function that is
// only ever called from one guarded place is easy to audit.
import { and, eq, isNull, sql } from 'drizzle-orm';

import { trainingSamples } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export interface TrainingMark {
  xMm: number;
  yMm: number;
  caliberMm: number;
  /**
   * The shooter nudged this mark after placing it. The single most valuable
   * bit in the row: it is the difference between "a hole is here" and "a hole
   * is here, and my first guess was wrong".
   */
  moved: boolean;
  /** The ring they called on an edge, or null where they took the geometry's. */
  calledRingLabel: string | null;
  /**
   * Placed by the hole detector rather than by a tap. With `moved` this
   * grades every kept suggestion: right as proposed, or corrected. A rejected
   * suggestion is deleted before saving and so never reaches this table.
   */
  suggested: boolean;
}

export interface TrainingSampleInput {
  seriesId: string;
  targetFaceId: string;
  geometrySource: 'auto' | 'manual';
  photoUri: string | null;
  marks: readonly TrainingMark[];
}

/**
 * Records one photo-scored series as a labelled example, replacing any
 * earlier sample for the same series.
 *
 * Replacing matters: re-scoring a series should leave the corrected labels,
 * not both versions. Keeping the superseded one would quietly fill the set
 * with examples the shooter has already rejected.
 */
export function recordTrainingSample(db: Database, input: TrainingSampleInput): string | null {
  // A series with no marks is not an example of anything.
  if (input.marks.length === 0) return null;

  const now = nowIso();
  db.update(trainingSamples)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(trainingSamples.seriesId, input.seriesId), isNull(trainingSamples.deletedAt)))
    .run();

  const id = newId();
  db.insert(trainingSamples)
    .values({
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      seriesId: input.seriesId,
      targetFaceId: input.targetFaceId,
      geometrySource: input.geometrySource,
      photoUri: input.photoUri,
      marksJson: JSON.stringify(input.marks),
    })
    .run();
  return id;
}

/** How many samples are held, for the Settings row that offers to delete them. */
export function countTrainingSamples(db: Database): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(trainingSamples)
    .where(isNull(trainingSamples.deletedAt))
    .get();
  return row?.count ?? 0;
}

/**
 * Deletes every sample outright — a real DELETE, not the soft delete the rest
 * of the schema uses.
 *
 * The soft-delete convention exists so sync can propagate a tombstone. This
 * table never syncs, so there is nothing a tombstone would tell anyone, and
 * "delete my collected data" that leaves the data in the file would be a lie.
 */
export function deleteAllTrainingSamples(db: Database): void {
  db.delete(trainingSamples).run();
}
