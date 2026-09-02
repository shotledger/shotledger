// Plain base64 encode/decode (not encryption — no cipher, no secret material
// derived here). Encoding turns decrypted vault bytes into a `data:` URI so
// <Image> can render them without ever writing plaintext to disk; decoding
// turns a share card's rasterized `Svg.toDataURL()` output back into bytes
// for `File.write()` (app/src/platform/share-card.ts). Hermes has no global
// `btoa`/`atob`/`Buffer`; this is the standard RFC 4648 alphabet.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const DECODE_LOOKUP = new Map<string, number>(
  ALPHABET.split('').map((char, index) => [char, index]),
);

export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    result += ALPHABET[b0 >> 2];
    result += ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    result += b1 === undefined ? '=' : ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    result += b2 === undefined ? '=' : ALPHABET[b2 & 0x3f];
  }
  return result;
}

/** Accepts an optional `data:...;base64,` prefix — strips it before decoding. */
export function base64ToBytes(base64: string): Uint8Array {
  const comma = base64.indexOf(',');
  const clean = (
    comma >= 0 && base64.slice(0, comma).includes('base64') ? base64.slice(comma + 1) : base64
  ).replace(/=+$/, '');

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = DECODE_LOOKUP.get(char);
    if (value === undefined) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
