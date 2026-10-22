// Filesystem + image pipeline for synced photos (§0 rule 6: platform quirks
// behind a wrapper). Downloaded photos live in one directory keyed by photo
// id, so `shotledger-photo:<id>` resolves to the same file on every device
// without the path itself ever syncing.
import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { parseSyncPhotoUri, PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE_PX } from '@shotledger/shared';

const SYNC_PHOTO_DIR = 'sync-photos';

function directory(): Directory {
  const dir = new Directory(Paths.document, SYNC_PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function syncPhotoFile(photoId: string): File {
  return new File(directory(), `${photoId}.jpg`);
}

/**
 * Turns whatever `series.photo_uri` holds into something the UI can show: a
 * local path passes through; a `shotledger-photo:` marker resolves to this
 * device's downloaded copy, or `null` while the queue has not fetched it yet.
 */
export function resolveSeriesPhotoUri(photoUri: string | null): string | null {
  if (photoUri === null) return null;
  const photoId = parseSyncPhotoUri(photoUri);
  if (photoId === null) return photoUri;
  if (Platform.OS === 'web') return null;
  const file = syncPhotoFile(photoId);
  return file.exists ? file.uri : null;
}

/**
 * True when `series.photo_uri` names a file on this device that is no longer
 * there, as after the OS cleared the cache it was saved in (#652). A sync
 * marker is never gone: it is waiting to download.
 */
export function seriesPhotoGone(photoUri: string | null): boolean {
  if (photoUri === null || Platform.OS === 'web' || !photoUri.startsWith('file:')) return false;
  try {
    return !new File(photoUri).exists;
  } catch {
    return true;
  }
}

export function hasLocalSyncPhoto(photoId: string): boolean {
  if (Platform.OS === 'web') return false;
  return syncPhotoFile(photoId).exists;
}

export function writeSyncPhoto(photoId: string, bytes: Uint8Array): void {
  const file = syncPhotoFile(photoId);
  if (!file.exists) file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
}

/**
 * Resize before upload (ARCHITECTURE.md § Sync: "~2048 px JPEG ≈ 300–600 KB; originals
 * never leave the device"). Returns the JPEG bytes, never the original.
 */
export async function prepareSyncPhotoBytes(localUri: string): Promise<Uint8Array> {
  const context = ImageManipulator.ImageManipulator.manipulate(localUri);
  const probe = await context.renderAsync();
  // Only ever downscale — upscaling a small photo adds no detail and would
  // push it toward the server's size cap for nothing.
  if (Math.max(probe.width, probe.height) > PHOTO_MAX_EDGE_PX) {
    context.resize(
      probe.width >= probe.height ? { width: PHOTO_MAX_EDGE_PX } : { height: PHOTO_MAX_EDGE_PX },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: PHOTO_JPEG_QUALITY,
  });
  return new File(saved.uri).bytesSync();
}
