// Plain base64 *encoding* (not encryption — no cipher, no secret material
// derived here) for turning decrypted vault bytes into a `data:` URI so
// <Image> can render them without ever writing plaintext to disk. Hermes has
// no global `btoa`/`Buffer`; this is the standard RFC 4648 alphabet.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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
