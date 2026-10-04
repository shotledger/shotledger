// Relative, location-independent path rewriting for the "database+photos"
// bundle kind, so restore is location-independent.
import { PHOTOS_ENTRY_PREFIX, SYNC_PHOTOS_ENTRY_PREFIX } from './types';

/** Container entry name for one series' photo, e.g. `photos/<seriesId>.jpg`. */
export function photoEntryName(seriesId: string, extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${PHOTOS_ENTRY_PREFIX}${seriesId}${ext}`;
}

/** Extracts the file extension (with leading dot, lowercased) from a URI,
 * falling back to `.jpg` when none is present (e.g. an opaque content:// URI). */
export function extensionFromUri(uri: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(uri);
  return match ? `.${match[1]!.toLowerCase()}` : '.jpg';
}

// Restore turns these names into file paths, so they are whitelisted to the
// exact `<id>.<ext>` shape export writes: no separator and no dot in the id.
const PHOTO_ENTRY_PATTERN = /^photos\/[\w-]+\.[a-z0-9]+$/;
const SYNC_PHOTO_ENTRY_PATTERN = /^sync-photos\/[\w-]+\.jpg$/;

export function isPhotoEntryName(name: string): boolean {
  return PHOTO_ENTRY_PATTERN.test(name);
}

/** The bare filename (id + extension) of a photo entry, e.g. `photos/abc.jpg` -> `abc.jpg`. */
export function photoEntryFilename(entryName: string): string {
  return entryName.slice(PHOTOS_ENTRY_PREFIX.length);
}

/** Container entry name for a synced photo, keyed by its sync photo id
 * (`sync-photos/<photoId>.jpg`) rather than by series — one file can back
 * several series, and the id is what `shotledger-photo:<id>` resolves to. */
export function syncPhotoEntryName(photoId: string): string {
  return `${SYNC_PHOTOS_ENTRY_PREFIX}${photoId}.jpg`;
}

export function isSyncPhotoEntryName(name: string): boolean {
  return SYNC_PHOTO_ENTRY_PATTERN.test(name);
}

/** False for a name under either photo prefix that is not a well-formed
 * photo entry. Any other name is never written to disk, so it passes. */
export function isSafeEntryName(name: string): boolean {
  if (name.startsWith(SYNC_PHOTOS_ENTRY_PREFIX)) return isSyncPhotoEntryName(name);
  if (name.startsWith(PHOTOS_ENTRY_PREFIX)) return isPhotoEntryName(name);
  return true;
}

/** `sync-photos/abc.jpg` -> `abc`. */
export function syncPhotoEntryId(entryName: string): string {
  return entryName.slice(SYNC_PHOTOS_ENTRY_PREFIX.length, entryName.length - '.jpg'.length);
}
