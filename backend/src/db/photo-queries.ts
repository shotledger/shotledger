import { eq } from 'drizzle-orm';

import { applyQuotaDelta } from '../lib/quota';
import { DEFAULT_QUOTA_BYTES } from '../config';
import { photos, quota } from './photo-schema';
import type { Db } from './queries';

export interface QuotaState {
  usedBytes: number;
  limitBytes: number;
}

export interface PhotoRow {
  photoId: string;
  userId: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
}

/** Lazily-initialized quota (spec §5): no row until the user's first upload. */
export async function getQuota(db: Db, userId: string): Promise<QuotaState> {
  const rows = await db.select().from(quota).where(eq(quota.userId, userId)).limit(1);
  const row = rows[0];
  return row
    ? { usedBytes: row.usedBytes, limitBytes: row.limitBytes }
    : { usedBytes: 0, limitBytes: DEFAULT_QUOTA_BYTES };
}

export async function findPhoto(db: Db, photoId: string): Promise<PhotoRow | undefined> {
  const rows = await db.select().from(photos).where(eq(photos.photoId, photoId)).limit(1);
  return rows[0];
}

/**
 * Upserts the photo row and updates quota usage in one D1 batch (spec §5
 * step 6). A re-upload to the same `photoId` nets only the size difference,
 * never the sum (P12). The caller must already have run `authorizeOwner` on
 * any existing row (the upload route does, P13): the upsert never changes
 * `userId`.
 */
export async function recordUpload(
  db: Db,
  userId: string,
  photoId: string,
  sizeBytes: number,
  contentType: string,
  createdAt: string,
): Promise<QuotaState> {
  const existing = await findPhoto(db, photoId);
  const priorSize = existing && existing.userId === userId ? existing.sizeBytes : 0;
  const current = await getQuota(db, userId);
  const newUsed = applyQuotaDelta(current.usedBytes, sizeBytes - priorSize);

  await db.batch([
    db
      .insert(photos)
      .values({ photoId, userId, sizeBytes, contentType, createdAt })
      .onConflictDoUpdate({
        target: photos.photoId,
        set: { sizeBytes, contentType, createdAt },
      }),
    db
      .insert(quota)
      .values({ userId, usedBytes: newUsed, limitBytes: current.limitBytes })
      .onConflictDoUpdate({ target: quota.userId, set: { usedBytes: newUsed } }),
  ]);

  return { usedBytes: newUsed, limitBytes: current.limitBytes };
}

/** Deletes the photo row and decrements quota usage in one D1 batch (spec §5). */
export async function recordDelete(
  db: Db,
  userId: string,
  photoId: string,
  sizeBytes: number,
): Promise<QuotaState> {
  const current = await getQuota(db, userId);
  const newUsed = applyQuotaDelta(current.usedBytes, -sizeBytes);

  await db.batch([
    db.delete(photos).where(eq(photos.photoId, photoId)),
    db
      .insert(quota)
      .values({ userId, usedBytes: newUsed, limitBytes: current.limitBytes })
      .onConflictDoUpdate({ target: quota.userId, set: { usedBytes: newUsed } }),
  ]);

  return { usedBytes: newUsed, limitBytes: current.limitBytes };
}
