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
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
