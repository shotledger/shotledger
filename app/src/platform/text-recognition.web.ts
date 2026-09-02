// Web stub for on-device OCR (see text-recognition.ts): ML Kit is a native
// module, and a WASM recogniser would be a second engine to maintain for a
// surface that has no camera flow anyway — same boundary as
// shot-listener.web.ts. The licence form hides its scan action when this
// reports `unsupported`.
import type { RecognizeTextResult } from './text-recognition';

export async function recognizeText(_imageUri: string): Promise<RecognizeTextResult> {
  return { status: 'unsupported' };
}

export async function deleteScannedImage(_imageUri: string): Promise<void> {
  // Nothing was written to a file system this build can address.
}
