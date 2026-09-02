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
});
