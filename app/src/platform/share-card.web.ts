// Web stub (see share-card.ts): react-native-svg's toDataURL and
// expo-sharing both lack a usable web implementation under this Expo SDK's
// static web export — same boundary as pdf-export.ts and csv-export.ts.
export async function shareCardPng(_base64Png: string, _filename: string): Promise<boolean> {
  return false;
}
