// Relative, location-independent path rewriting for the "database+photos"
// bundle kind (plan.md v2: "paths rewritten so restore is location-independent").
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

export function isPhotoEntryName(name: string): boolean {
  return name.startsWith(PHOTOS_ENTRY_PREFIX) && name.length > PHOTOS_ENTRY_PREFIX.length;
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
  return name.startsWith(SYNC_PHOTOS_ENTRY_PREFIX) && name.endsWith('.jpg');
}

/** `sync-photos/abc.jpg` -> `abc`. */
export function syncPhotoEntryId(entryName: string): string {
  return entryName.slice(SYNC_PHOTOS_ENTRY_PREFIX.length, entryName.length - '.jpg'.length);
}
