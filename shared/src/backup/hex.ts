// Hex encoding for the small byte strings a backup manifest carries (the KDF
// salt). Hex rather than base64 so the manifest stays trivially validatable
// by a regex and identical on every platform, with no atob/btoa dependency.

export class InvalidHexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHexError';
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new InvalidHexError(`hex string has odd length: ${hex.length}`);
  }
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new InvalidHexError('hex string contains a non-hex character');
  }
  // Collected into a plain array first, then converted: writing past the end
  // of a pre-sized Uint8Array is a silent no-op, which would make an
  // off-by-one in this loop invisible to any test.
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return Uint8Array.from(bytes);
}
