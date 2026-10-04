/**
 * Photo upload/download queue rules (docs/specs/sync-app-spec.md §9). Pure:
 * the queue rows live in SQLite and the bytes move over HTTP, but every
 * decision about *which* entry moves next and whether a failure is worth
 * retrying is made here.
 */

/** After this many failed attempts an entry stops consuming battery. */
export const MAX_PHOTO_ATTEMPTS = 5;

export type PhotoQueueKind = 'upload' | 'download';

export interface PhotoQueueEntry {
  id: string;
  kind: PhotoQueueKind;
  photoId: string;
  /** Source file for an upload; destination for a download. */
  localUri: string | null;
  attempts: number;
  lastError: string | null;
  /** ISO-8601. */
  createdAt: string;
}

/**
 * Oldest-first, skipping entries that have exhausted their attempts.
 * Oldest-first (not newest) so a burst of new photos cannot starve the one
 * the user has been waiting on since yesterday.
 */
export function selectNextPhotoTask(entries: readonly PhotoQueueEntry[]): PhotoQueueEntry | null {
  let best: PhotoQueueEntry | null = null;
  for (const entry of entries) {
    if (entry.attempts >= MAX_PHOTO_ATTEMPTS) continue;
    if (best === null || entry.createdAt < best.createdAt) best = entry;
  }
  return best;
}

/**
 * HTTP status classification. A 413 (too large / over quota) and a 404
 * (photo gone server-side) are permanent: the same bytes will fail the same
 * way forever, so retrying is a battery bug, not resilience. 401 is
 * permanent for the queue too — the controller handles re-auth, and the
 * entry is retried after the next successful sign-in.
 */
export function isRetryablePhotoStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  return false;
}

export type PhotoTaskOutcome =
  { type: 'succeeded' } | { type: 'failed'; retryable: boolean; error: string };

export type PhotoQueueAction =
  | { type: 'remove'; id: string }
  | { type: 'retry'; id: string; attempts: number; lastError: string }
  | { type: 'giveUp'; id: string; attempts: number; lastError: string };

export function applyPhotoTaskOutcome(
  entry: PhotoQueueEntry,
  outcome: PhotoTaskOutcome,
): PhotoQueueAction {
  if (outcome.type === 'succeeded') return { type: 'remove', id: entry.id };

  const attempts = entry.attempts + 1;
  if (!outcome.retryable || attempts >= MAX_PHOTO_ATTEMPTS) {
    // Spend every remaining attempt: the cap is what stops
    // selectNextPhotoTask picking the entry again.
    return { type: 'giveUp', id: entry.id, attempts: MAX_PHOTO_ATTEMPTS, lastError: outcome.error };
  }
  return { type: 'retry', id: entry.id, attempts, lastError: outcome.error };
}

/**
 * Client-side resize target (ADR 0003 photo policy: "~2048 px JPEG").
 * Kept here rather than in the Expo adapter so the number is covered by the
 * gauntlet and shared with any future non-Expo client.
 */
export const PHOTO_MAX_EDGE_PX = 2048;
export const PHOTO_JPEG_QUALITY = 0.8;
/** Mirrors backend/src/config.ts MAX_PHOTO_BYTES — the server's hard cap. */
export const PHOTO_MAX_BYTES = 1_500_000;

/** A photo the client already knows is over the cap must not be uploaded. */
export function fitsPhotoSizeCap(sizeBytes: number): boolean {
  return sizeBytes <= PHOTO_MAX_BYTES;
}
