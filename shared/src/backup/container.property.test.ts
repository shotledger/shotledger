// Round-trip properties of the backup container over arbitrary entries
// (#806): whatever is packed unpacks to the same names, bytes and order, and
// no truncation of a valid container is read as a valid one.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { InvalidContainerError, packContainer, unpackContainer } from './container';

/** Unique, non-empty names (any Unicode) with arbitrary content. */
const entries = fc
  .uniqueArray(
    fc.record({
      name: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }),
      data: fc.uint8Array({ maxLength: 256 }),
    }),
    { selector: (e) => e.name, maxLength: 12 },
  )
  .map((list) => list.map((e) => ({ name: e.name, data: e.data })));

describe('container properties', () => {
  it('unpack(pack(entries)) is entries', () => {
    fc.assert(
      fc.property(entries, (list) => {
        expect(unpackContainer(packContainer(list))).toEqual(list);
      }),
    );
  });

  it('reads a container at any offset inside a larger buffer', () => {
    fc.assert(
      fc.property(entries, fc.uint8Array({ maxLength: 16 }), (list, prefix) => {
        const packed = packContainer(list);
        const buffer = new Uint8Array(prefix.length + packed.length);
        buffer.set(prefix);
        buffer.set(packed, prefix.length);
        expect(unpackContainer(buffer.subarray(prefix.length))).toEqual(list);
      }),
    );
  });

  it('refuses every strict prefix of a container with at least one entry', () => {
    fc.assert(
      fc.property(
        entries.filter((list) => list.length > 0),
        fc.nat(),
        (list, cut) => {
          const packed = packContainer(list);
          const prefix = packed.subarray(0, cut % packed.length);
          expect(() => unpackContainer(prefix)).toThrow(InvalidContainerError);
        },
      ),
    );
  });
});
