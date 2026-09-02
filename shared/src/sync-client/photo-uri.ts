/**
 * How a synced photo is named inside a synced row
 * (docs/specs/sync-app-spec.md §11).
 *
 * A `series.photo_uri` holding a device-local `file:///…` path is meaningless
 * on the other device, and rewriting it after download would push the rewrite
 * back and clobber the origin device. So once a photo is uploaded, the column
 * holds a device-independent marker and each device resolves it to its own
 * cache path at read time — nothing about the local filesystem ever syncs.
 */

export const SYNC_PHOTO_SCHEME = 'shotledger-photo:';

export function toSyncPhotoUri(photoId: string): string {
  return `${SYNC_PHOTO_SCHEME}${photoId}`;
}

/** The photo id if `uri` is a synced marker, else `null`. */
export function parseSyncPhotoUri(uri: string | null | undefined): string | null {
  if (typeof uri !== 'string' || !uri.startsWith(SYNC_PHOTO_SCHEME)) return null;
  const photoId = uri.slice(SYNC_PHOTO_SCHEME.length);
  return photoId.length > 0 ? photoId : null;
}

/** True for a local file path that has not been uploaded yet. */
export function isLocalPhotoUri(uri: string | null | undefined): boolean {
  return typeof uri === 'string' && uri.length > 0 && parseSyncPhotoUri(uri) === null;
}
