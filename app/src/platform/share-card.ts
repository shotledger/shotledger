// Platform wrapper for share cards (plan.md v2). The card is a
// react-native-svg <Svg> (app/src/components/share-card-svg.tsx), rasterized
// on-device via that library's own `Svg.toDataURL()` — no new dependency:
// react-native-svg is already a direct dependency (used by GroupPlot and the
// target face) and has shipped a native PNG snapshot method for years.
// Mirrors csv-export.ts's shape (expo-file-system + expo-sharing). Degrades
// to a silent no-op on web — see share-card.web.ts.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { base64ToBytes } from './base64';

/** Writes a base64 PNG (from `Svg.toDataURL`) to a cache file and opens the native share sheet. */
export async function shareCardPng(base64Png: string, filename: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(base64ToBytes(base64Png));
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png' });
    return true;
  } catch {
    return false;
  }
}
