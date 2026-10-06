import { describe, expect, it } from 'vitest';

import { crc32, createZip } from './zip';

/** Reads a stored-only archive back through its central directory. */
function readZip(bytes: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const dataStart = local + 30 + view.getUint16(local + 26, true);
    entries.push({ name, crc, data: bytes.subarray(dataStart, dataStart + size) });
    at += 46 + nameLength;
  }
  return entries;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('createZip', () => {
  it('stores each entry so its bytes, name and checksum read back', async () => {
    const json = new TextEncoder().encode('{"format":"shotledger.sessions"}');
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0xd9]);
    const blob = createZip([
      { name: 'sessions.json', data: json },
      { name: 'photos/2026-05-01 – serie 1.jpg', data: photo },
    ]);
    expect(blob.type).toBe('application/zip');

    const entries = readZip(new Uint8Array(await blob.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual([
      'sessions.json',
      'photos/2026-05-01 – serie 1.jpg',
    ]);
    expect([...entries[0]!.data]).toEqual([...json]);
    expect([...entries[1]!.data]).toEqual([...photo]);
    expect(entries.map((e) => e.crc)).toEqual([crc32(json), crc32(photo)]);
  });

  it('writes an empty archive as just the end record', async () => {
    const blob = createZip([]);
    expect(blob.size).toBe(22);
    expect(readZip(new Uint8Array(await blob.arrayBuffer()))).toEqual([]);
  });
});
