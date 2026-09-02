// Photo capture for scoring, and the two-resolution rule that comes with it.
// Spec: docs/specs/photo-scoring-phase1-spec.md §5.1.
//
// Two resolutions, deliberately:
//  * GEOMETRY runs on a 2048 px long-side copy. The CV spike measured
//    identical ring residuals at 2048 and 4000 (§3), and 1024 is definitively
//    too low. It is also load-bearing for MEMORY, not just speed:
//    react-native-fast-opencv has no `imread`, so pixels arrive as base64,
//    and a 4000 px JPEG is a ~5.5 MB string on the JS heap (§4.6).
//  * The MARK LOUPE re-crops from the ORIGINAL. The spike's recommendation is
//    explicit — re-crop hole regions from full resolution once geometry is
//    known rather than raising the global resize (§4.4).
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Long side, in px, of the copy the geometry stage sees. */
export const GEOMETRY_LONG_SIDE_PX = 2048;

export type CaptureSource = 'camera' | 'library';

export interface CapturedPhoto {
  /** The original, full-resolution file. The loupe crops from this. */
  readonly originalUri: string;
  readonly originalWidth: number;
  readonly originalHeight: number;
}

export type CaptureResult = CapturedPhoto | null | 'denied';

function toCaptured(asset: ImagePicker.ImagePickerAsset): CapturedPhoto {
  return {
    originalUri: asset.uri,
    originalWidth: asset.width,
    originalHeight: asset.height,
  };
}

/**
 * `quality: 1` and no editing, unlike the existing series-photo picker: a
 * compressed or cropped photo is exactly what the geometry stage cannot
 * recover from.
 */
export async function capturePhoto(source: CaptureSource): Promise<CaptureResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

  if (result.canceled) return null;
  const asset = result.assets[0];
  return asset ? toCaptured(asset) : null;
}

export interface GeometryImage {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly base64: string;
  /** originalWidth / width — the factor that maps geometry px back to the original. */
  readonly scaleToOriginal: number;
}

/**
 * The 2048 px base64 copy the OpenCV stage consumes. A photo already at or
 * below 2048 px is passed through at its own size rather than upscaled —
 * upscaling adds no information and costs heap.
 */
export async function prepareGeometryImage(photo: CapturedPhoto): Promise<GeometryImage> {
  const longSide = Math.max(photo.originalWidth, photo.originalHeight);
  const needsResize = longSide > GEOMETRY_LONG_SIDE_PX;
  const isLandscape = photo.originalWidth >= photo.originalHeight;

  const context = ImageManipulator.ImageManipulator.manipulate(photo.originalUri);
  if (needsResize) {
    context.resize(
      isLandscape ? { width: GEOMETRY_LONG_SIDE_PX } : { height: GEOMETRY_LONG_SIDE_PX },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.92,
    base64: true,
  });

  return {
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    base64: saved.base64 ?? '',
    scaleToOriginal: photo.originalWidth / saved.width,
  };
}

export interface LoupeCrop {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

/**
 * A magnified crop around a point, taken from the ORIGINAL file so the user
 * is nudging a mark against real detail rather than against the 2048 px
 * copy's interpolation.
 *
 * `centerX`/`centerY` are in geometry-image pixels; `scaleToOriginal` maps
 * them up. The crop is clamped to the image, so a mark near the edge yields a
 * smaller crop rather than an error.
 */
export async function cropLoupe(
  photo: CapturedPhoto,
  centerX: number,
  centerY: number,
  scaleToOriginal: number,
  sizePx = 320,
): Promise<LoupeCrop> {
  const cx = centerX * scaleToOriginal;
  const cy = centerY * scaleToOriginal;
  const half = sizePx / 2;

  const originX = Math.max(0, Math.min(photo.originalWidth - 1, Math.round(cx - half)));
  const originY = Math.max(0, Math.min(photo.originalHeight - 1, Math.round(cy - half)));
  const width = Math.max(1, Math.min(sizePx, photo.originalWidth - originX));
  const height = Math.max(1, Math.min(sizePx, photo.originalHeight - originY));

  const context = ImageManipulator.ImageManipulator.manipulate(photo.originalUri);
  context.crop({ originX, originY, width, height });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 1,
  });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
