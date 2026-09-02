// On-device OCR, behind the platform wrapper (hard rule 6). The only import
// of `@react-native-ml-kit/text-recognition` in the app lives here, so the
// screens depend on a result union rather than on a native module that does
// not exist on web.
//
// ML Kit's text recognition runs entirely on the device: the bundled Latin
// model ships inside the APK/IPA and the image never leaves the phone. That
// is the privacy boundary the licence-card feature needs — see
// docs/specs/license-card-ocr-spec.md.
import { File } from 'expo-file-system';
import TextRecognition from '@react-native-ml-kit/text-recognition';

export type RecognizeTextResult =
  /** `text` is the raw recognised text, blocks joined by newlines. */
  | { status: 'ok'; text: string }
  /** No OCR engine on this platform (web). */
  | { status: 'unsupported' }
  /** The engine ran and failed — a corrupt file, an unreadable URI. */
  | { status: 'failed' };

export async function recognizeText(imageUri: string): Promise<RecognizeTextResult> {
  try {
    const result = await TextRecognition.recognize(imageUri);
    return { status: 'ok', text: result.text };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * Removes the picker's cached copy of the scanned image. The card is the most
 * sensitive thing the app ever sees, so it does not linger in the cache after
 * the text has been read — unless the user asked for it in the vault, where
 * it is stored encrypted instead.
 */
export async function deleteScannedImage(imageUri: string): Promise<void> {
  try {
    const file = new File(imageUri);
    if (file.exists) file.delete();
  } catch {
    // A URI the file API cannot address (a content:// pick) is not ours to
    // delete; nothing was copied out of it either.
  }
}
