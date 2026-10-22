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
 * What a failure costs the entry, and whether the pass goes on:
 * - `permanent`: the same request fails the same way forever (404, 413, no
 *   local file, over the size cap). Terminal; retrying is a battery bug.
 * - `transient`: the server answered but could not serve it now (5xx, 408,
 *   429), or the device could not read or write the file. One attempt.
 * - `unreachable`: no response at all (offline, DNS, timeout). Free: not the
 *   photo's fault, and counting it turns a weekend offline into never.
 * - `unauthenticated`: 401. Free: the controller re-authenticates, and the
 *   next pass retries the entry.
 * Anything but `permanent` ends the pass, since its cause has not changed
 * within it.
 */
export type PhotoFailure = 'permanent' | 'transient' | 'unreachable' | 'unauthenticated';

export function photoFailureForStatus(status: number): PhotoFailure {
  if (status === 401) return 'unauthenticated';
  if (status === 408 || status === 429 || status >= 500) return 'transient';
  return 'permanent';
}

export type PhotoTaskOutcome =
  { type: 'succeeded' } | { type: 'failed'; failure: PhotoFailure; error: string };

export type PhotoQueueAction =
  | { type: 'remove'; id: string; endPass: boolean }
  | { type: 'retry'; id: string; attempts: number; lastError: string; endPass: boolean }
  | { type: 'giveUp'; id: string; attempts: number; lastError: string; endPass: boolean };

export function applyPhotoTaskOutcome(
  entry: PhotoQueueEntry,
  outcome: PhotoTaskOutcome,
): PhotoQueueAction {
  if (outcome.type === 'succeeded') return { type: 'remove', id: entry.id, endPass: false };

  const { id } = entry;
  const lastError = outcome.error;
  const endPass = outcome.failure !== 'permanent';
  const attempts = outcome.failure === 'transient' ? entry.attempts + 1 : entry.attempts;
  if (!endPass || attempts >= MAX_PHOTO_ATTEMPTS) {
    // Spend every remaining attempt: the cap is what stops
    // selectNextPhotoTask picking the entry again.
    return { type: 'giveUp', id, attempts: MAX_PHOTO_ATTEMPTS, lastError, endPass };
  }
  return { type: 'retry', id, attempts, lastError, endPass };
}

/**
 * Client-side resize target (ARCHITECTURE.md § Sync photo policy: "~2048 px JPEG").
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

/**
 * The size `prepareSyncPhotoBytes` resizes to: the longer edge at most
 * `PHOTO_MAX_EDGE_PX`, aspect kept, never upscaled. Shared with the web's
 * encoder (docs/specs/web-entry-photo-spec.md C4).
 */
export function scaledPhotoSize(width: number, height: number): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= PHOTO_MAX_EDGE_PX) return { width, height };
  const shorter = (edge: number) => Math.max(1, Math.round((edge * PHOTO_MAX_EDGE_PX) / longer));
  return width >= height
    ? { width: PHOTO_MAX_EDGE_PX, height: shorter(height) }
    : { width: shorter(width), height: PHOTO_MAX_EDGE_PX };
}
