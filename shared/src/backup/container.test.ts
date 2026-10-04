import { describe, expect, it } from 'vitest';

import {
  type ContainerEntry,
  InvalidContainerError,
  packContainer,
  unpackContainer,
} from './container';

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function uint32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** The container layout written by hand, with none of packContainer's
 * checks — so a test can build the bundle a hostile file would be. */
function encodeRaw(
  entries: readonly ContainerEntry[],
  trailing: readonly number[] = [],
): Uint8Array {
  const out: number[] = [...packContainer([]).slice(0, 8), ...uint32le(entries.length)];
  for (const entry of entries) {
    const name = bytesOf(entry.name);
    out.push(name.length & 0xff, name.length >>> 8, ...name, ...uint32le(entry.data.length));
    out.push(...entry.data);
  }
  out.push(...trailing);
  return Uint8Array.from(out);
}

describe('packContainer / unpackContainer', () => {
  it('round-trips an empty entry list', () => {
    const packed = packContainer([]);
    expect(unpackContainer(packed)).toEqual([]);
  });

  it('round-trips a single text entry', () => {
    const entries: ContainerEntry[] = [{ name: 'manifest.json', data: bytesOf('{"a":1}') }];
    const unpacked = unpackContainer(packContainer(entries));
    expect(unpacked).toHaveLength(1);
    expect(unpacked[0]!.name).toBe('manifest.json');
    expect(unpacked[0]!.data).toEqual(bytesOf('{"a":1}'));
  });

  it('round-trips multiple entries including binary and empty content', () => {
    const binary = new Uint8Array([0, 1, 2, 255, 254, 253, 0]);
    const entries: ContainerEntry[] = [
      { name: 'database.sqlite3', data: binary },
      { name: 'photos/abc.jpg', data: new Uint8Array([]) },
      { name: 'photos/déf.png', data: bytesOf('unicode name test') },
    ];
    const unpacked = unpackContainer(packContainer(entries));
    expect(unpacked).toHaveLength(3);
    expect(unpacked[0]).toEqual(entries[0]);
    expect(unpacked[1]).toEqual(entries[1]);
    expect(unpacked[2]).toEqual(entries[2]);
  });

  it('preserves entry order', () => {
    const entries: ContainerEntry[] = Array.from({ length: 20 }, (_, i) => ({
      name: `file-${i}`,
      data: bytesOf(`content-${i}`),
    }));
    const unpacked = unpackContainer(packContainer(entries));
    expect(unpacked.map((e) => e.name)).toEqual(entries.map((e) => e.name));
  });

  it('produces independent copies (mutating input after packing does not affect the unpacked result)', () => {
    const data = new Uint8Array([1, 2, 3]);
    const packed = packContainer([{ name: 'f', data }]);
    data[0] = 99;
    const [unpacked] = unpackContainer(packed);
    expect(unpacked!.data).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rejects data too short to contain the header', () => {
    expect(() => unpackContainer(new Uint8Array([1, 2, 3]))).toThrow(InvalidContainerError);
  });

  it('throws an error that names itself, so a log line says what failed', () => {
    expect(() => unpackContainer(new Uint8Array(3))).toThrow(
      expect.objectContaining({ name: 'InvalidContainerError' }),
    );
  });

  it('rejects data with a bad magic', () => {
    const packed = packContainer([{ name: 'f', data: bytesOf('x') }]);
    const corrupted = packed.slice();
    corrupted[0] = 0;
    expect(() => unpackContainer(corrupted)).toThrow(InvalidContainerError);
  });

  it('rejects truncated content', () => {
    const packed = packContainer([{ name: 'f', data: bytesOf('hello world') }]);
    const truncated = packed.slice(0, packed.length - 5);
    expect(() => unpackContainer(truncated)).toThrow(InvalidContainerError);
  });

  it('rejects a name longer than 65535 bytes', () => {
    const longName = 'x'.repeat(70000);
    expect(() => packContainer([{ name: longName, data: bytesOf('x') }])).toThrow(
      InvalidContainerError,
    );
  });

  it('the hand-written encoder in this file matches packContainer byte for byte', () => {
    const entries: ContainerEntry[] = [
      { name: 'manifest.json', data: bytesOf('{}') },
      { name: 'photos/a.jpg', data: Uint8Array.from([0, 255]) },
    ];
    expect(encodeRaw(entries)).toEqual(packContainer(entries));
  });

  it('rejects a duplicate entry name, so a second manifest cannot shadow the first', () => {
    const duplicated = encodeRaw([
      { name: 'manifest.json', data: bytesOf('{"a":1}') },
      { name: 'manifest.json', data: bytesOf('{"a":2}') },
    ]);
    expect(() => unpackContainer(duplicated)).toThrow(/^duplicate entry name: manifest\.json$/);
  });

  it('rejects an empty entry name', () => {
    const unnamed = encodeRaw([{ name: '', data: bytesOf('x') }]);
    expect(() => unpackContainer(unnamed)).toThrow(/^empty entry name$/);
  });

  it('rejects bytes after the last entry', () => {
    const padded = encodeRaw([{ name: 'f', data: bytesOf('x') }], [0]);
    expect(() => unpackContainer(padded)).toThrow(/^trailing bytes after the last entry$/);
    expect(() => unpackContainer(encodeRaw([], [1, 2, 3]))).toThrow(InvalidContainerError);
  });

  it('refuses to pack a duplicate or an empty name', () => {
    const twice = [
      { name: 'f', data: bytesOf('1') },
      { name: 'f', data: bytesOf('2') },
    ];
    expect(() => packContainer(twice)).toThrow(/^duplicate entry name: f$/);
    expect(() => packContainer([{ name: '', data: bytesOf('x') }])).toThrow(/^empty entry name$/);
  });

  // One entry, name 'ab', content 'xyz': magic 0-7, count 8-11, name length
  // 12-13, name 14-15, content length 16-19, content 20-22. Each cut names
  // the first field it falls inside; the boundary cuts pin each `>` check.
  it.each([
    [12, 'truncated entry name length'],
    [13, 'truncated entry name length'],
    [14, 'truncated entry name'],
    [15, 'truncated entry name'],
    [16, 'truncated entry content length'],
    [19, 'truncated entry content length'],
    [20, 'truncated entry content'],
    [22, 'truncated entry content'],
  ])('cut at byte %i is refused as "%s"', (cut, message) => {
    const whole = packContainer([{ name: 'ab', data: bytesOf('xyz') }]);
    expect(whole).toHaveLength(23);
    expect(() => unpackContainer(whole.slice(0, cut))).toThrow(new RegExp(`^${message}$`));
  });

  it('reads a container that ends exactly at its last byte', () => {
    const whole = packContainer([{ name: 'ab', data: bytesOf('xyz') }]);
    expect(unpackContainer(whole)).toEqual([{ name: 'ab', data: bytesOf('xyz') }]);
  });

  it('accepts exactly the 12-byte header of an empty container and nothing shorter', () => {
    const empty = packContainer([]);
    expect(empty).toHaveLength(12);
    expect(unpackContainer(empty)).toEqual([]);
    expect(() => unpackContainer(empty.slice(0, 11))).toThrow(
      /^bundle is too short to be a backup container$/,
    );
  });

  it('checks every magic byte, not only the first', () => {
    const packed = packContainer([]);
    for (let i = 0; i < 8; i++) {
      const corrupted = packed.slice();
      corrupted[i] = corrupted[i]! ^ 0xff;
      expect(() => unpackContainer(corrupted), `byte ${i}`).toThrow(
        /^not a ShotLedger backup bundle \(bad magic\)$/,
      );
    }
  });

  it('reads a container that sits at an offset inside a larger buffer', () => {
    const packed = packContainer([{ name: 'f', data: bytesOf('hi') }]);
    const host = new Uint8Array(packed.length + 5);
    host.set(packed, 5);
    expect(unpackContainer(host.subarray(5))).toEqual([{ name: 'f', data: bytesOf('hi') }]);
  });

  it('names the entry whose name is too long', () => {
    expect(() => packContainer([{ name: 'y'.repeat(0x10000), data: bytesOf('x') }])).toThrow(
      /^entry name too long: y+$/,
    );
    expect(() => packContainer([{ name: 'y'.repeat(0xffff), data: bytesOf('x') }])).not.toThrow();
  });
});
