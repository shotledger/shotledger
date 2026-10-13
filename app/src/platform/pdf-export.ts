// Platform wrapper for PDF export (§4 M6, expo-print). The HTML content
// itself is a pure function (shared/src/export/session-report.ts, snapshot-tested);
// this module is the thin best-effort layer that turns it into a file and
// opens the share sheet — cross-platform (expo-print/expo-sharing), no
// Android-only module. Degrades to a silent no-op on web, where neither
// package has a usable implementation.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Renders `html` to a PDF file named `filename` and opens the native share
 * sheet. expo-print names its file with a UUID, which is what the receiving
 * app would show, so the file is moved to the name first.
 */
export async function exportHtmlAsPdf(html: string, filename: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const named = new File(Paths.cache, filename);
    if (named.exists) named.delete();
    new File(uri).moveSync(named);
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return true;
  } catch {
    return false;
  }
}
