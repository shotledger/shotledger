import { base64ToBytes, bytesToBase64 } from './base64';

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

describe('base64ToBytes', () => {
  it('round-trips arbitrary bytes through bytesToBase64', () => {
    const bytes = Uint8Array.from({ length: 41 }, (_, i) => (i * 11) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('decodes the classic "Man"/"Ma"/"M" RFC 4648 padding examples', () => {
    expect(base64ToBytes('TWFu')).toEqual(utf8('Man'));
    expect(base64ToBytes('TWE=')).toEqual(utf8('Ma'));
    expect(base64ToBytes('TQ==')).toEqual(utf8('M'));
  });

  it('strips a data: URL prefix before decoding', () => {
    expect(base64ToBytes(`data:image/png;base64,${bytesToBase64(utf8('png'))}`)).toEqual(
      utf8('png'),
    );
  });

  it('decodes an empty string as an empty array', () => {
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });
});
