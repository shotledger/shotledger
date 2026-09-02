// Seal/open a document-vault envelope. See docs/specs/document-vault-spec.md
// "Envelope format". No RN/Expo import (spec constraint N1).
import {
  ENVELOPE_VERSION,
  IV_BYTES,
  TAG_BYTES,
  VaultEnvelopeFormatError,
  VaultTamperError,
  type AesGcmProvider,
} from './types';

const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;

/**
 * Encrypts `plaintext` with a fresh random IV (spec constraint N2 — never
 * derived/reused) and packs `[version][iv][tag][ciphertext]` into one
 * `Uint8Array`.
 */
export async function seal<Key>(
  plaintext: Uint8Array,
  key: Key,
  provider: AesGcmProvider<Key>,
): Promise<Uint8Array> {
  const iv = provider.randomBytes(IV_BYTES);
  const { ciphertext, tag } = await provider.encrypt(plaintext, key, iv);

  const out = new Uint8Array(HEADER_BYTES + ciphertext.length);
  out[0] = ENVELOPE_VERSION;
  out.set(iv, 1);
  out.set(tag, 1 + IV_BYTES);
  out.set(ciphertext, HEADER_BYTES);
  return out;
}

/**
 * Parses and decrypts a sealed envelope. Throws `VaultEnvelopeFormatError`
 * for a malformed envelope (too short, unknown version) and
 * `VaultTamperError` when the provider rejects the authentication tag
 * (spec constraint N3 — no plaintext is ever returned unverified).
 */
export async function open<Key>(
  sealed: Uint8Array,
  key: Key,
  provider: AesGcmProvider<Key>,
): Promise<Uint8Array> {
  if (sealed.length < HEADER_BYTES) {
    throw new VaultEnvelopeFormatError(
      `Envelope too short: expected at least ${HEADER_BYTES} bytes, got ${sealed.length}`,
    );
  }

  const version = sealed[0];
  if (version !== ENVELOPE_VERSION) {
    throw new VaultEnvelopeFormatError(`Unsupported envelope version: ${String(version)}`);
  }

  const iv = sealed.subarray(1, 1 + IV_BYTES);
  const tag = sealed.subarray(1 + IV_BYTES, HEADER_BYTES);
  const ciphertext = sealed.subarray(HEADER_BYTES);

  try {
    return await provider.decrypt(ciphertext, tag, key, iv);
  } catch (cause) {
    throw new VaultTamperError(cause);
  }
}
