// Platform wrapper for PDF export (§4 M6, expo-print). The HTML content
// itself is a pure function (shared/src/export/pdf-log.ts, snapshot-tested);
// this module is the thin best-effort layer that turns it into a file and
// opens the share sheet — cross-platform (expo-print/expo-sharing), no
// Android-only module. Degrades to a silent no-op on web, where neither
// package has a usable implementation.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Renders `html` to a PDF file and opens the native share sheet. */
export async function exportHtmlAsPdf(html: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return true;
  } catch {
    return false;
  }
}
