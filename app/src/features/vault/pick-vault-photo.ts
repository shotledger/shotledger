// Camera-or-library photo pick for a new vault document. Mirrors
// app/src/features/session/pick-photo.ts's shape (permission dance isolated
// from the screen), extended with a camera source per the task brief ("add
// (camera or library via existing expo-image-picker)").
import * as ImagePicker from 'expo-image-picker';

export type PickVaultPhotoResult = string | null | 'denied';

export async function pickVaultPhotoFromLibrary(): Promise<PickVaultPhotoResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

export async function pickVaultPhotoFromCamera(): Promise<PickVaultPhotoResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'denied';

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}
