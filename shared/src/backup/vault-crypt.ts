// Passphrase re-wrap for the vault section of a backup bundle.
//
// The vault's own AES-256 key lives in the platform keystore and cannot leave
// the device, so copying vault ciphertext into a bundle would produce
// something nothing could ever decrypt. Instead the payload is decrypted with
// the device key (in memory), then re-sealed under a key derived from a
// passphrase the user supplies at export time. Salt and iteration count go
// into the bundle manifest; the passphrase never does.
//
// The AEAD itself is the existing vault envelope (AES-256-GCM, random IV,
// authentication tag) — the same reviewed native primitive the vault uses at
// rest. See docs/specs/backup-export-spec.md.
import { open, seal, VaultTamperError, type AesGcmProvider } from '../vault';

import { bytesToHex, hexToBytes } from './hex';
import { pbkdf2Sha256 } from './pbkdf2';

export const VAULT_KDF_NAME = 'pbkdf2-hmac-sha256';
export const VAULT_KDF_SALT_BYTES = 16;
export const VAULT_KDF_KEY_BYTES = 32;

/**
 * Default PBKDF2 iteration count for new bundles. Chosen against the on-device
 * measurement in docs/specs/backup-export-evidence.md — high enough to be a
 * real barrier, low enough that export/restore stays interactive on the
 * slowest supported hardware. Every bundle records the count it was made
 * with, so raising this later never breaks an existing bundle.
 */
export const VAULT_KDF_ITERATIONS = 150_000;

/** Minimum passphrase length the UI enforces before offering to include the vault. */
export const VAULT_PASSPHRASE_MIN_LENGTH = 10;

/** The supplied passphrase did not decrypt the bundle's vault section. */
export class BackupVaultPassphraseError extends Error {
  constructor(cause?: unknown) {
    super('Wrong passphrase for this backup’s vault section');
    this.name = 'BackupVaultPassphraseError';
    this.cause = cause;
  }
}

/**
 * Both devices must agree byte-for-byte on the passphrase. Surrounding
 * whitespace is dropped (a trailing space from a keyboard suggestion is a
 * support problem, not a security property) and the string is NFC-normalised
 * where the runtime supports it, so an "ä" typed on iOS matches one typed on
 * Android.
 */
export function normalizePassphrase(passphrase: string): string {
  const trimmed = passphrase.trim();
  return typeof trimmed.normalize === 'function' ? trimmed.normalize('NFC') : trimmed;
}

/** Turns a raw 32-byte key into whatever the platform's AES-GCM wants. */
export interface RawKeyImporter<Key> {
  importRawKey(raw: Uint8Array): Promise<Key>;
}

export interface VaultCryptoDeps<Key> extends RawKeyImporter<Key> {
  provider: AesGcmProvider<Key>;
}

export interface SealedVaultSection {
  sealed: Uint8Array;
  saltHex: string;
  iterations: number;
}

async function deriveKey<Key>(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  deps: VaultCryptoDeps<Key>,
): Promise<Key> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(normalizePassphrase(passphrase));
  const raw = pbkdf2Sha256(passwordBytes, salt, iterations, VAULT_KDF_KEY_BYTES);
  try {
    return await deps.importRawKey(raw);
  } finally {
    raw.fill(0);
    passwordBytes.fill(0);
  }
}

export async function sealVaultSection<Key>(
  payload: Uint8Array,
  passphrase: string,
  deps: VaultCryptoDeps<Key>,
  iterations: number = VAULT_KDF_ITERATIONS,
): Promise<SealedVaultSection> {
  const salt = deps.provider.randomBytes(VAULT_KDF_SALT_BYTES);
  const key = await deriveKey(passphrase, salt, iterations, deps);
  const sealed = await seal(payload, key, deps.provider);
  return { sealed, saltHex: bytesToHex(salt), iterations };
}

/**
 * Reverses `sealVaultSection`. Throws `BackupVaultPassphraseError` when the
 * GCM tag does not verify — which is what a wrong passphrase looks like, and
 * is deliberately indistinguishable from tampering (AEAD gives no oracle).
 */
export async function openVaultSection<Key>(
  sealed: Uint8Array,
  passphrase: string,
  saltHex: string,
  iterations: number,
  deps: VaultCryptoDeps<Key>,
): Promise<Uint8Array> {
  const key = await deriveKey(passphrase, hexToBytes(saltHex), iterations, deps);
  try {
    return await open(sealed, key, deps.provider);
  } catch (cause) {
    if (cause instanceof VaultTamperError) throw new BackupVaultPassphraseError(cause);
    throw cause;
  }
}
