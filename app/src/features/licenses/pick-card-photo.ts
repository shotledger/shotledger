// Camera-or-library photo pick for the licence-card scan. Mirrors
// app/src/features/session/pick-photo.ts's shape (permission dance isolated
// from the screen), with a camera source as well as the library. The picked
// image is read by the OCR engine and then deleted — nothing keeps it.
import * as ImagePicker from 'expo-image-picker';

export type PickCardPhotoResult = string | null | 'denied';

export async function pickCardPhotoFromLibrary(): Promise<PickCardPhotoResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

export async function pickCardPhotoFromCamera(): Promise<PickCardPhotoResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'denied';

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}
