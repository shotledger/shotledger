// PBKDF2-HMAC-SHA256 (RFC 8018 §5.2) for the vault section of a backup
// bundle: it stretches a user passphrase into the AES-256 key that protects
// that section. See docs/specs/backup-export-spec.md.
//
// The primitive comes from `@noble/hashes` — audited, zero-dependency, pure
// JavaScript, so it works on Hermes without a native module. `expo-crypto`
// is not an option here: its only hashing entry point is an async
// whole-message `digest()`, one native round trip per call, which puts a
// six-figure iteration count out of reach.
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * @param password Passphrase bytes (UTF-8; normalise with
 * `normalizePassphrase` before encoding so both devices agree).
 * @param salt Random per-bundle salt; stored in the bundle manifest.
 * @param iterations Iteration count; stored in the bundle manifest so a
 * bundle stays readable after the app's own default changes.
 * @param keyLength Derived key length in bytes.
 */
export function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): Uint8Array {
  // Checked here rather than left to noble: it answers a bare `Error` for
  // `c === 0` and `dkLen === 0`, and callers of this module are documented to
  // get a RangeError for every nonsensical parameter.
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError(`pbkdf2Sha256: iterations must be a positive integer, got ${iterations}`);
  }
  if (!Number.isInteger(keyLength) || keyLength < 1) {
    throw new RangeError(`pbkdf2Sha256: keyLength must be a positive integer, got ${keyLength}`);
  }

  return pbkdf2(sha256, password, salt, { c: iterations, dkLen: keyLength });
}
