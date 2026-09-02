// Spec behaviours P1–P5 — the plaintext vault payload container.
import { describe, expect, it } from 'vitest';

import { InvalidContainerError, packContainer } from './container';
import {
  packVaultPayload,
  unpackVaultPayload,
  vaultDocumentEntryName,
  VAULT_PAYLOAD_INDEX_NAME,
} from './vault-payload';

const bytes = (...values: number[]) => Uint8Array.from(values);

describe('vault payload', () => {
  it('P1: round-trips an index and its documents', () => {
    const payload = {
      indexJson: '{"documents":[{"id":"a"},{"id":"b"}]}',
      documents: [
        { id: 'a', bytes: bytes(1, 2, 3) },
        { id: 'b', bytes: bytes(255, 0, 128, 7) },
      ],
    };
    const round = unpackVaultPayload(packVaultPayload(payload));
    expect(round.indexJson).toBe(payload.indexJson);
    expect(round.documents).toEqual(payload.documents);
  });

  it('P2: round-trips an empty vault (index only, no documents)', () => {
    const round = unpackVaultPayload(
      packVaultPayload({ indexJson: '{"documents":[]}', documents: [] }),
    );
    expect(round.indexJson).toBe('{"documents":[]}');
    expect(round.documents).toEqual([]);
  });

  it('P3: round-trips an empty document body and a photo-sized one', () => {
    const large = new Uint8Array(300_000);
    for (let i = 0; i < large.length; i++) large[i] = i & 0xff;
    const round = unpackVaultPayload(
      packVaultPayload({
        indexJson: '{}',
        documents: [
          { id: 'empty', bytes: new Uint8Array(0) },
          { id: 'large', bytes: large },
        ],
      }),
    );
    expect(round.documents[0]!.bytes.length).toBe(0);

    // Byte-by-byte rather than toEqual: a deep-equality assertion over
    // 300 000 elements is orders of magnitude slower than the code under test.
    const restored = round.documents[1]!.bytes;
    expect(restored.length).toBe(large.length);
    let identical = true;
    for (let i = 0; i < large.length; i++) {
      if (restored[i] !== large[i]) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(true);
  });

  it('P4: rejects a payload with no index entry', () => {
    const noIndex = packContainer([{ name: vaultDocumentEntryName('a'), data: bytes(1) }]);
    expect(() => unpackVaultPayload(noIndex)).toThrow(InvalidContainerError);
  });

  it('P5: ignores unknown entries rather than failing (forward compatibility)', () => {
    const withExtra = packContainer([
      { name: VAULT_PAYLOAD_INDEX_NAME, data: new TextEncoder().encode('{}') },
      { name: 'something/from-a-newer-build', data: bytes(9) },
      { name: vaultDocumentEntryName('a'), data: bytes(1) },
    ]);
    const round = unpackVaultPayload(withExtra);
    expect(round.documents).toEqual([{ id: 'a', bytes: bytes(1) }]);
  });
});
