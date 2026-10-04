// Custom uncompressed archive format for `.shotledger` backup bundles.
// No zip library exists in this repo's lockfile (fflate/jszip/etc — none),
// and CLAUDE.md hard rule 2 forbids adding a dependency without asking, so
// bundles use this small hand-rolled container instead. Layout: an 8-byte
// magic, a little-endian uint32 entry count, then per entry a little-endian
// uint16 name length + UTF-8 name + little-endian uint32 content length +
// content bytes. No compression — files are the DB copy and photos as-is.
const MAGIC = new Uint8Array([0x53, 0x4c, 0x42, 0x4b, 0x55, 0x50, 0x31, 0x00]); // "SLBKUP1\0"

export interface ContainerEntry {
  name: string;
  data: Uint8Array;
}

export class InvalidContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidContainerError';
  }
}

/** Entry names are unique and non-empty, so a lookup by name is unambiguous:
 * a second `manifest.json` cannot shadow the first. Checked on both sides. */
function checkName(name: string, seen: Set<string>): void {
  if (name.length === 0) throw new InvalidContainerError('empty entry name');
  if (seen.has(name)) throw new InvalidContainerError(`duplicate entry name: ${name}`);
  seen.add(name);
}

export function packContainer(entries: readonly ContainerEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const encodedNames = entries.map((e) => encoder.encode(e.name));
  const seen = new Set<string>();
  let total = MAGIC.length + 4;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const nameBytes = encodedNames[i]!;
    checkName(entry.name, seen);
    if (nameBytes.length > 0xffff) {
      throw new InvalidContainerError(`entry name too long: ${entry.name}`);
    }
    total += 2 + nameBytes.length + 4 + entry.data.length;
  }

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;
  out.set(MAGIC, offset);
  offset += MAGIC.length;
  view.setUint32(offset, entries.length, true);
  offset += 4;

  for (let i = 0; i < entries.length; i++) {
    const nameBytes = encodedNames[i]!;
    view.setUint16(offset, nameBytes.length, true);
    offset += 2;
    out.set(nameBytes, offset);
    offset += nameBytes.length;

    const data = entries[i]!.data;
    view.setUint32(offset, data.length, true);
    offset += 4;
    out.set(data, offset);
    offset += data.length;
  }

  return out;
}

export function unpackContainer(bytes: Uint8Array): ContainerEntry[] {
  if (bytes.length < MAGIC.length + 4) {
    throw new InvalidContainerError('bundle is too short to be a backup container');
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new InvalidContainerError('not a ShotLedger backup bundle (bad magic)');
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = MAGIC.length;
  const count = view.getUint32(offset, true);
  offset += 4;

  const entries: ContainerEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 2 > bytes.length) throw new InvalidContainerError('truncated entry name length');
    const nameLen = view.getUint16(offset, true);
    offset += 2;

    if (offset + nameLen > bytes.length) throw new InvalidContainerError('truncated entry name');
    const name = decoder.decode(bytes.subarray(offset, offset + nameLen));
    checkName(name, seen);
    offset += nameLen;

    if (offset + 4 > bytes.length)
      throw new InvalidContainerError('truncated entry content length');
    const contentLen = view.getUint32(offset, true);
    offset += 4;

    if (offset + contentLen > bytes.length)
      throw new InvalidContainerError('truncated entry content');
    const data = bytes.slice(offset, offset + contentLen);
    offset += contentLen;

    entries.push({ name, data });
  }

  if (offset !== bytes.length) {
    throw new InvalidContainerError('trailing bytes after the last entry');
  }
  return entries;
}
