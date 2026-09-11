// Shared plumbing for "write a text document to the cache and open the
// share sheet" — the mechanism csv-export.ts introduced in M7 and the
// analytics report's JSON export now reuses (expo-file-system +
// expo-sharing, no Android-only module). Degrades to a silent no-op on
// web, where neither package has a usable implementation.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export interface ShareTextFileOptions {
  filename: string;
  mimeType: string;
  /** iOS Uniform Type Identifier for the same content. */
  uti: string;
}

export async function shareTextFile(
  text: string,
  { filename, mimeType, uti }: ShareTextFileOptions,
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(file.uri, { mimeType, UTI: uti });
    return true;
  } catch {
    return false;
  }
}

/**
 * Shares a file that already exists — a stored target photo, rather than text
 * written on the fly. The share sheet is also how a photo gets copied,
 * saved to the gallery, or sent anywhere else, so one entry point covers
 * "copy/share/export" without the app owning any of those flows.
 */
export async function shareExistingFile(
  uri: string,
  mimeType: string,
  uti: string,
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType, UTI: uti });
    return true;
  } catch {
    return false;
  }
}
