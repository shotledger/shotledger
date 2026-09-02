import { bytesToBase64 } from './base64';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('bytesToBase64', () => {
  it('encodes the classic "Man"/"Ma"/"M" RFC 4648 padding examples', () => {
    expect(bytesToBase64(utf8('Man'))).toBe('TWFu');
    expect(bytesToBase64(utf8('Ma'))).toBe('TWE=');
    expect(bytesToBase64(utf8('M'))).toBe('TQ==');
  });

  it('encodes an empty array as an empty string', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
  });

  it('round-trips against atob for arbitrary bytes', () => {
    const bytes = Uint8Array.from({ length: 37 }, (_, i) => (i * 7) % 256);
    const encoded = bytesToBase64(bytes);
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });
});
