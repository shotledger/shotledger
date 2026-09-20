// Per-series target photo (§4 M3). expo-image-picker is cross-platform, so
// this is not a platform wrapper — it only isolates the permission dance from
// the screen so the screen stays declarative.
import * as ImagePicker from 'expo-image-picker';

export type PickPhotoResult = string | null | 'denied';

/**
 * Opens the photo library and returns the picked local file URI.
 * `null` = the user canceled; `'denied'` = permission was refused.
 */
export async function pickSeriesPhoto(): Promise<PickPhotoResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}
