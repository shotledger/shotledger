// A picked target photo as the phone would upload it
// (docs/specs/web-entry-photo-spec.md C4, C5): decoded with its EXIF
// orientation applied, downscaled to the shared edge, re-encoded as JPEG on a
// canvas. The canvas writes no metadata, so no EXIF or location leaves the
// browser, and the picked file itself is never sent. Browser APIs only.
import {
  fitsPhotoSizeCap,
  PHOTO_JPEG_QUALITY,
  scaledPhotoSize,
} from '@shotledger/shared/src/sync-client/photo-queue';

export type EncodedPhoto =
  { ok: true; blob: Blob } | { ok: false; error: 'unreadable' | 'tooLarge' };

export async function encodeSeriesPhoto(file: Blob): Promise<EncodedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, error: 'unreadable' };
  }
  const { width, height } = scaledPhotoSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    return { ok: false, error: 'unreadable' };
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY),
  );
  if (blob === null || blob.type !== 'image/jpeg') return { ok: false, error: 'unreadable' };
  return fitsPhotoSizeCap(blob.size) ? { ok: true, blob } : { ok: false, error: 'tooLarge' };
}
