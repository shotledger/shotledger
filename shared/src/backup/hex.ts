// Hex encoding for the small byte strings a backup manifest carries (the KDF
// salt). Hex rather than base64 so the manifest stays trivially validatable
// by a regex and identical on every platform, with no atob/btoa dependency.
//
// The conversion is `@noble/hashes/utils`. This module stays as a seam
// because noble's decoder has two code paths — the `Uint8Array.fromHex`
// built-in where the runtime has it, a portable fallback otherwise — whose
// rejections differ in wording and, on the built-in path, in class.
import {
  bytesToHex as nobleBytesToHex,
  hexToBytes as nobleHexToBytes,
} from '@noble/hashes/utils.js';

export class InvalidHexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHexError';
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return nobleBytesToHex(bytes);
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new InvalidHexError(`hex string has odd length: ${hex.length}`);
  }
  try {
    return nobleHexToBytes(hex);
  } catch {
    throw new InvalidHexError('hex string contains a non-hex character');
  }
}
