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
import TextRecognition, { type TextLine } from '@react-native-ml-kit/text-recognition';

export type RecognizeTextResult =
  /** `text` is the raw recognised text, blocks joined by newlines. */
  | { status: 'ok'; text: string }
  /** No OCR engine on this platform (web). */
  | { status: 'unsupported' }
  /** The engine ran and failed — a corrupt file, an unreadable URI. */
  | { status: 'failed' };

/**
 * Rebuilds the card's visual reading order from line geometry.
 *
 * ML Kit's own `result.text` concatenates *blocks*, and on a two-column card
 * it makes the label column one block and the value column another — so the
 * flat text is every label, then every value, and no parser can pair them.
 * Grouping lines by vertical overlap and sorting each group left-to-right
 * puts "Ändamål  Målskjutning" back on one line, which is what the parser
 * reads. (Verified on the emulator: 4 fields recognised before this,
 * 10 after — see docs/specs/license-card-ocr-evidence.md.)
 */
export function linesInReadingOrder(lines: readonly TextLine[], fallback: string): string {
  const positioned = lines.filter((line) => line.frame);
  // Older/other engines may omit frames; without them the flat text is all
  // there is.
  if (positioned.length !== lines.length || positioned.length === 0) return fallback;

  const sorted = [...positioned].sort((a, b) => a.frame!.top - b.frame!.top);
  const rows: TextLine[][] = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    const reference = row?.[0];
    const sameRow =
      reference !== undefined &&
      Math.abs(centerY(line) - centerY(reference)) <
        0.6 * Math.min(line.frame!.height, reference.frame!.height);
    if (row && sameRow) row.push(line);
    else rows.push([line]);
  }

  return rows
    .map((row) =>
      [...row]
        .sort((a, b) => a.frame!.left - b.frame!.left)
        .map((line) => line.text)
        .join('  '),
    )
    .join('\n');
}

function centerY(line: TextLine): number {
  return line.frame!.top + line.frame!.height / 2;
}

export async function recognizeText(imageUri: string): Promise<RecognizeTextResult> {
  try {
    const result = await TextRecognition.recognize(imageUri);
    const lines = result.blocks.flatMap((block) => block.lines);
    return { status: 'ok', text: linesInReadingOrder(lines, result.text) };
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
