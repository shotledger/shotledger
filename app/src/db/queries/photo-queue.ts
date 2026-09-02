// Photo upload/download queue rows (docs/specs/sync-app-spec.md §2). The
// queue lives in SQLite so it survives a restart; every decision about what
// to do with an entry is made by shared/src/sync-client/photo-queue.ts.
import { and, eq, isNotNull } from 'drizzle-orm';

import {
  isLocalPhotoUri,
  parseSyncPhotoUri,
  type PhotoQueueEntry,
  type PhotoQueueKind,
} from '@shotledger/shared';

import { photoQueue, series } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export function listPhotoQueue(db: Database): PhotoQueueEntry[] {
  return db
    .select()
    .from(photoQueue)
    .all()
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      photoId: row.photoId,
      localUri: row.localUri,
      attempts: row.attempts,
      lastError: row.lastError,
      createdAt: row.createdAt,
    }));
}

/** Idempotent: one pending entry per (kind, photoId). */
export function enqueuePhotoTask(
  db: Database,
  kind: PhotoQueueKind,
  photoId: string,
  localUri: string | null,
): void {
  const existing = db
    .select()
    .from(photoQueue)
    .where(and(eq(photoQueue.kind, kind), eq(photoQueue.photoId, photoId)))
    .get();
  if (existing) return;

  db.insert(photoQueue)
    .values({ id: newId(), kind, photoId, localUri, attempts: 0, createdAt: nowIso() })
    .run();
}

export function removePhotoTask(db: Database, id: string): void {
  db.delete(photoQueue).where(eq(photoQueue.id, id)).run();
}

export function recordPhotoAttempt(
  db: Database,
  id: string,
  attempts: number,
  lastError: string,
): void {
  db.update(photoQueue).set({ attempts, lastError }).where(eq(photoQueue.id, id)).run();
}

/**
 * Reconciles the queue with what the series rows actually reference. Run
 * before each sync rather than hooking every photo write site: a photo taken
 * while signed out is picked up by the first sync after sign-in, and a
 * download that was never finished is re-queued on the next launch.
 *
 * `hasLocalCopy` is injected so this stays testable without a filesystem.
 */
export function reconcilePhotoQueue(
  db: Database,
  hasLocalCopy: (photoId: string) => boolean,
): void {
  const rows = db.select().from(series).where(isNotNull(series.photoUri)).all();

  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    const photoUri = row.photoUri;
    if (isLocalPhotoUri(photoUri)) {
      // Not uploaded yet — the series id doubles as the photo id, which is
      // what makes the upload idempotent across retries and devices.
      enqueuePhotoTask(db, 'upload', row.id, photoUri);
      continue;
    }
    const photoId = parseSyncPhotoUri(photoUri);
    if (photoId !== null && !hasLocalCopy(photoId)) {
      enqueuePhotoTask(db, 'download', photoId, null);
    }
  }
}
