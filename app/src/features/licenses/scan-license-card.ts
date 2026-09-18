// Orchestrates the "Scan card" action: pick a photo, read it on-device, parse
// it. Kept out of the screen (and every dependency injectable) so the flow —
// including what happens to the image afterwards — is unit-testable without a
// camera.
//
// The scanned image is never kept — issue #276 removed the Vault that used
// to store it. It is deleted here on every path that produces nothing to
// confirm; on the success path it is handed back so the screen can show the
// result, and the screen deletes it (`deleteScannedImage`) as soon as the
// form is saved or abandoned.
import { parseLicenseCard, type ParsedLicenseCard } from '@shotledger/shared';

import {
  pickCardPhotoFromCamera,
  pickCardPhotoFromLibrary,
  type PickCardPhotoResult,
} from '@/features/licenses/pick-card-photo';
import {
  deleteScannedImage,
  recognizeText,
  type RecognizeTextResult,
} from '@/platform/text-recognition';

export type ScanSource = 'camera' | 'library';

export type ScanLicenseCardResult =
  | { status: 'scanned'; imageUri: string; text: string; parsed: ParsedLicenseCard }
  /** The user backed out of the picker. */
  | { status: 'cancelled' }
  /** Camera or media-library permission was refused. */
  | { status: 'denied' }
  /** No OCR engine on this platform. */
  | { status: 'unsupported' }
  /** The engine ran but produced nothing usable. */
  | { status: 'failed' };

export interface ScanLicenseCardDeps {
  pickFromCamera(): Promise<PickCardPhotoResult>;
  pickFromLibrary(): Promise<PickCardPhotoResult>;
  recognize(imageUri: string): Promise<RecognizeTextResult>;
  deleteImage(imageUri: string): Promise<void>;
}

export function defaultScanLicenseCardDeps(): ScanLicenseCardDeps {
  return {
    pickFromCamera: pickCardPhotoFromCamera,
    pickFromLibrary: pickCardPhotoFromLibrary,
    recognize: recognizeText,
    deleteImage: deleteScannedImage,
  };
}

export async function scanLicenseCard(
  source: ScanSource,
  deps: ScanLicenseCardDeps = defaultScanLicenseCardDeps(),
): Promise<ScanLicenseCardResult> {
  const picked = source === 'camera' ? await deps.pickFromCamera() : await deps.pickFromLibrary();
  if (picked === 'denied') return { status: 'denied' };
  if (picked === null) return { status: 'cancelled' };

  const recognized = await deps.recognize(picked);
  if (recognized.status !== 'ok') {
    await deps.deleteImage(picked);
    return { status: recognized.status === 'unsupported' ? 'unsupported' : 'failed' };
  }

  const parsed = parseLicenseCard(recognized.text);
  return { status: 'scanned', imageUri: picked, text: recognized.text, parsed };
}

/** How many of the card's fields the parse produced a value for — the number
 *  the "n fields recognised, check them" notice reports. */
export function countRecognizedFields(parsed: ParsedLicenseCard): number {
  const values = [
    parsed.licenseNumber,
    parsed.purpose,
    parsed.decidedOn,
    parsed.validUntil,
    parsed.conditions,
    parsed.authority,
    parsed.make,
    parsed.model,
    parsed.caliber,
    parsed.vapenId,
  ];
  return values.filter((v) => v !== null).length + (parsed.validUntilIndefinite ? 1 : 0);
}

/** The licence form's text-input values for a parse. A field the parse missed
 *  keeps whatever the user had already typed rather than being blanked. */
export function licenseFormValues(
  parsed: ParsedLicenseCard,
  current: {
    licenseNumber: string;
    purpose: string;
    decidedOn: string;
    validUntil: string;
    conditions: string;
    authority: string;
  },
): typeof current {
  return {
    licenseNumber: parsed.licenseNumber ?? current.licenseNumber,
    purpose: parsed.purpose ?? current.purpose,
    decidedOn: parsed.decidedOn ?? current.decidedOn,
    // "Tills vidare" is an empty valid-until, and it is a real reading of the
    // card rather than a miss, so it clears anything already there.
    validUntil: parsed.validUntilIndefinite ? '' : (parsed.validUntil ?? current.validUntil),
    conditions: parsed.conditions ?? current.conditions,
    authority: parsed.authority ?? current.authority,
  };
}
