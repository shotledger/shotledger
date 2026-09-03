// PBKDF2-HMAC-SHA256 (RFC 8018 §5.2) over the portable HMAC in sha256.ts.
// Used only to stretch a user passphrase into the AES-256 key that protects
// the vault section of a backup bundle; see docs/specs/backup-export-spec.md.
import { HmacSha256, SHA256_DIGEST_BYTES } from './sha256';

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
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError(`pbkdf2Sha256: iterations must be a positive integer, got ${iterations}`);
  }
  if (!Number.isInteger(keyLength) || keyLength < 1) {
    throw new RangeError(`pbkdf2Sha256: keyLength must be a positive integer, got ${keyLength}`);
  }

  const hmac = new HmacSha256(password);
  const blocks = Math.ceil(keyLength / SHA256_DIGEST_BYTES);
  const out = new Uint8Array(blocks * SHA256_DIGEST_BYTES);

  // salt || INT_32_BE(blockIndex), reused across blocks.
  const seed = new Uint8Array(salt.length + 4);
  seed.set(salt);
  const seedView = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);

  for (let block = 1; block <= blocks; block++) {
    seedView.setUint32(salt.length, block, false);

    let u = hmac.sign(seed);
    const accumulator = Uint8Array.from(u);
    for (let i = 1; i < iterations; i++) {
      u = hmac.sign(u);
      for (let j = 0; j < SHA256_DIGEST_BYTES; j++) accumulator[j] = accumulator[j]! ^ u[j]!;
    }
    out.set(accumulator, (block - 1) * SHA256_DIGEST_BYTES);
  }

  return out.slice(0, keyLength);
}
