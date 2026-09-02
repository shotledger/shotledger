// Platform wrapper for CSV export (§4 M7). The CSV text itself is a pure
// function (shared/src/csv), this module is the thin best-effort layer that
// writes it to a file and opens the native share sheet — mirrors
// pdf-export.ts's shape (expo-file-system + expo-sharing, no Android-only
// module). Degrades to a silent no-op on web, where neither package has a
// usable implementation.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Writes `csvText` to a cache file and opens the native share sheet. */
export async function shareCsv(csvText: string, filename: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(csvText);
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
    return true;
  } catch {
    return false;
  }
}
