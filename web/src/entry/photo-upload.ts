// Uploading the photos of one Save before its push
// (docs/specs/web-entry-photo-spec.md C1, C3). Pure apart from the injected
// upload; the bytes are held in memory only, with the request, for Retry.
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import { PhotoHttpError } from '@shotledger/shared/src/sync-client/http';
import { photoFailureForStatus } from '@shotledger/shared/src/sync-client/photo-queue';
import type { SeriesPhoto } from '@shotledger/shared/src/sync-client/session-entry';

/** A failure that has its own message on the page. */
export type PhotoError = 'photoRateLimited' | 'photoQuota' | 'photoTooLarge';

/** `held`: Retry can succeed, so the request is kept for it. */
export interface UploadFailure {
  error: SyncErrorKey;
  photo?: PhotoError;
  held: boolean;
}

/** The photos a request names, their bytes, and those the server confirmed. */
export interface HeldPhotos {
  ids: readonly string[];
  blobs: ReadonlyMap<string, Blob>;
  confirmed: ReadonlySet<string>;
}

export type UploadPhoto = (photoId: string, blob: Blob) => Promise<void>;

/** Whether a 413 body says the quota is full, rather than the photo too large. */
function isQuotaBody(body: string): boolean {
  let parsed: { error?: unknown } | null = null;
  try {
    parsed = JSON.parse(body) as { error?: unknown } | null;
  } catch {
    // Not JSON: read as the photo itself.
  }
  return parsed?.error === 'quota_exceeded';
}

/** What a thrown upload means for the save, as the phone's queue reads a status. */
export function photoUploadFailure(error: unknown): UploadFailure {
  // No status at all: the request may never have arrived.
  if (!(error instanceof PhotoHttpError)) return { error: 'network', held: true };
  const { status } = error;
  if (status === 429) return { error: 'unknown', photo: 'photoRateLimited', held: true };
  const failure = photoFailureForStatus(status);
  if (failure === 'unauthenticated') return { error: 'unauthenticated', held: true };
  if (failure === 'transient') return { error: 'network', held: true };
  if (status !== 413) return { error: 'unknown', held: false };
  const quota = isQuotaBody(error.message);
  return { error: 'unknown', photo: quota ? 'photoQuota' : 'photoTooLarge', held: false };
}

/**
 * Uploads, in order, every photo the server has not confirmed, to its own id;
 * stops at the first failure. Re-uploading an id replaces the object and nets
 * the quota (server P12), so a Retry that repeats an unconfirmed one is safe.
 */
export async function uploadPhotos(
  upload: UploadPhoto,
  photos: HeldPhotos,
): Promise<{ photos: HeldPhotos; failure: UploadFailure | null }> {
  const confirmed = new Set(photos.confirmed);
  const done = () => ({ ...photos, confirmed });
  const pending = photos.ids.filter((photoId) => !confirmed.has(photoId));
  // A photo without bytes cannot be sent, so nothing is: its series must not land.
  if (!pending.every((photoId) => photos.blobs.has(photoId))) {
    return { photos: done(), failure: { error: 'unknown', held: false } };
  }
  for (const photoId of pending) {
    try {
      await upload(photoId, photos.blobs.get(photoId)!);
    } catch (error: unknown) {
      return { photos: done(), failure: photoUploadFailure(error) };
    }
    confirmed.add(photoId);
  }
  return { photos: done(), failure: null };
}

/** The builder's photos with the blob picked on each one's form row. */
export function heldPhotosFor(
  photos: readonly SeriesPhoto[],
  rowKeys: readonly number[],
  picks: ReadonlyMap<number, Blob>,
): HeldPhotos {
  const blobs = new Map<string, Blob>();
  for (const { row, photoId } of photos) {
    const key = rowKeys[row - 1];
    const blob = key === undefined ? undefined : picks.get(key);
    if (blob !== undefined) blobs.set(photoId, blob);
  }
  return { ids: photos.map((photo) => photo.photoId), blobs, confirmed: new Set() };
}
