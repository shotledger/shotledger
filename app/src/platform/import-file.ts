// Platform wrapper for import file pickers: opens the system file picker and
// reads the chosen file's text. No expo-document-picker dependency needed —
// expo-file-system's `File.pickFileAsync` already wraps the native picker.
// Degrades to `null` on web/cancel/error, mirroring export-file.ts.
//
// TWO pickers, deliberately. Our own export is JSON; ShotLog's is CSV, and
// that is a third-party format we do not control (json-export-spec §1.1). One
// shared picker would have to advertise both, which would offer the user CSV
// files our importer will reject.
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

async function pickText(mimeTypes: readonly string[]): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const picked = await File.pickFileAsync({ mimeTypes: [...mimeTypes] });
    if (picked.canceled) return null;
    return await picked.result.text();
  } catch {
    return null;
  }
}

/** Our own sessions export. */
export async function pickJsonText(): Promise<string | null> {
  return pickText(['application/json', 'text/json', 'text/plain', '*/*']);
}

/** ShotLog's export — a foreign CSV format, unaffected by our move to JSON. */
export async function pickCsvText(): Promise<string | null> {
  return pickText(['text/csv', 'text/comma-separated-values', 'text/plain', '*/*']);
}
