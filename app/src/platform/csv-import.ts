// Platform wrapper for CSV import (§4 M7): opens the system file picker and
// reads the chosen file's text. No expo-document-picker dependency needed —
// expo-file-system's `File.pickFileAsync` already wraps the native picker.
// Degrades to `null` on web/cancel/error, mirroring csv-export.ts.
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Opens the file picker and returns the picked file's text, or `null` if
 * cancelled, unavailable (web), or unreadable. */
export async function pickCsvText(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const picked = await File.pickFileAsync({
      mimeTypes: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
    });
    if (picked.canceled) return null;
    return await picked.result.text();
  } catch {
    return null;
  }
}
