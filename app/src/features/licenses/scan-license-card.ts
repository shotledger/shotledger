// Orchestrates the "Scan card" action: pick a photo, read it on-device, parse
// it. Kept out of the screen (and every dependency injectable) so the flow —
// including what happens to the image afterwards — is unit-testable without a
// camera.
//
// The scanned image is deleted here on every path that produces nothing to
// confirm. On the success path it is handed back instead, because the user
// may still choose to put it in the vault; the screen deletes it once that
// decision is made.
import { parseLicenseCard, type ParsedLicenseCard } from '@shotledger/shared';

import {
  pickVaultPhotoFromCamera,
  pickVaultPhotoFromLibrary,
  type PickVaultPhotoResult,
} from '@/features/vault/pick-vault-photo';
import { addPhotoDocument } from '@/features/vault/vault-store';
import type { VaultDocumentMeta } from '@/features/vault/types';
import {
  deleteScannedImage,
  recognizeText,
  type RecognizeTextResult,
} from '@/platform/text-recognition';
import { requestVaultAccess, type VaultGateResult } from '@/platform/vault-auth';

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
  pickFromCamera(): Promise<PickVaultPhotoResult>;
  pickFromLibrary(): Promise<PickVaultPhotoResult>;
  recognize(imageUri: string): Promise<RecognizeTextResult>;
  deleteImage(imageUri: string): Promise<void>;
}

export function defaultScanLicenseCardDeps(): ScanLicenseCardDeps {
  return {
    pickFromCamera: pickVaultPhotoFromCamera,
    pickFromLibrary: pickVaultPhotoFromLibrary,
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

export type SettleScannedLicenseImageResult =
  /** Kept: encrypted into the vault. `documentId` is what the licence row's
   *  `vaultDocumentId` should be set to. */
  | { status: 'stored'; documentId: string }
  /** The user opted out of storing the original — deleted, nothing kept. */
  | { status: 'discarded' }
  /** The user asked to store it but the vault gate refused — the copy is
   *  lost rather than left in the picker's plaintext cache; they can scan
   *  again. */
  | { status: 'vaultDenied' };

export interface SettleScannedLicenseImageOptions {
  /** Keep the original by encrypting it into the vault (default: true —
   *  a gun shop needs to see the actual card). False is the explicit opt-out. */
  store: boolean;
  /** Vault document label, e.g. the licence number. */
  label: string;
  /** Biometric/passcode prompt shown before the vault write. */
  promptMessage: string;
}

export interface SettleScannedLicenseImageDeps {
  requestVaultAccess(promptMessage: string): Promise<VaultGateResult>;
  addPhotoDocument(sourceUri: string, label: string): Promise<VaultDocumentMeta>;
  deleteImage(imageUri: string): Promise<void>;
}

export function defaultSettleScannedLicenseImageDeps(): SettleScannedLicenseImageDeps {
  return {
    requestVaultAccess,
    addPhotoDocument: (sourceUri, label) => addPhotoDocument(sourceUri, 'license', label),
    deleteImage: deleteScannedImage,
  };
}

/**
 * Decides the scanned original's fate once the licence form is saved: kept
 * (encrypted into the vault, the default) or discarded (explicit opt-out).
 * The image is the most sensitive thing the app has seen, so every path
 * ends with it gone from the picker's plaintext cache.
 */
export async function settleScannedLicenseImage(
  imageUri: string,
  options: SettleScannedLicenseImageOptions,
  deps: SettleScannedLicenseImageDeps = defaultSettleScannedLicenseImageDeps(),
): Promise<SettleScannedLicenseImageResult> {
  if (!options.store) {
    await deps.deleteImage(imageUri);
    return { status: 'discarded' };
  }

  const access = await deps.requestVaultAccess(options.promptMessage);
  if (!access.granted) {
    await deps.deleteImage(imageUri);
    return { status: 'vaultDenied' };
  }

  const meta = await deps.addPhotoDocument(imageUri, options.label);
  await deps.deleteImage(imageUri);
  return { status: 'stored', documentId: meta.id };
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
