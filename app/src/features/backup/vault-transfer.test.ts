// Vault ↔ bundle transfer bookkeeping, with fakes for crypto and the
// filesystem — the crypto itself is gauntlet-tested in
// shared/src/backup/vault-crypt.test.ts. What matters here is the merge rule
// on restore (never destroy a document that exists only on this device) and
// that a document is re-sealed under *this* device's key.
import { packVaultPayload, unpackVaultPayload } from '@shotledger/shared';

import { addTextDocument, listDocuments, type VaultStoreDeps } from '@/features/vault/vault-store';

import { collectVaultPayload, installVaultPayload } from './vault-transfer';

/** Identity "encryption" tagged with a per-device key, so a test can tell
 * which key a document ended up sealed under. */
function keyedProvider(keyTag: number) {
  return {
    randomBytes: (n: number) => new Uint8Array(n),
    async encrypt(plaintext: Uint8Array) {
      const ciphertext = Uint8Array.from(plaintext, (b) => b ^ keyTag);
      return { ciphertext, tag: new Uint8Array(16) };
    },
    async decrypt(ciphertext: Uint8Array) {
      return Uint8Array.from(ciphertext, (b) => b ^ keyTag);
    },
  };
}

function fakeDeps(keyTag = 0): VaultStoreDeps {
  const files = new Map<string, Uint8Array>();
  return {
    getKey: async () => ({}) as never,
    provider: keyedProvider(keyTag),
    readIndexBytes: () => files.get('index') ?? null,
    writeIndexBytes: (bytes) => void files.set('index', bytes),
    readDocumentBytes: (id) => files.get(`doc:${id}`) ?? null,
    writeDocumentBytes: (id, bytes) => void files.set(`doc:${id}`, bytes),
    deleteDocumentBytes: (id) => void files.delete(`doc:${id}`),
    readSourceBytes: async () => new Uint8Array(0),
  };
}

describe('collectVaultPayload', () => {
  it('T1: returns null for an empty vault, so an opt-in adds no empty section', async () => {
    expect(await collectVaultPayload(fakeDeps())).toBeNull();
  });

  it('T2: collects every document with its metadata', async () => {
    const deps = fakeDeps();
    await addTextDocument('4471#', 'doorCode', 'Klubbdörr', deps);
    await addTextDocument('AB-123', 'license', 'Licens A', deps);

    const collected = await collectVaultPayload(deps);
    expect(collected?.documents).toBe(2);
    expect(collected?.unreadable).toBe(0);
  });

  it('T3: skips a document whose encrypted file has gone missing', async () => {
    const deps = fakeDeps();
    const kept = await addTextDocument('4471#', 'doorCode', 'Klubbdörr', deps);
    const lost = await addTextDocument('AB-123', 'license', 'Licens A', deps);
    deps.deleteDocumentBytes(lost.id);

    const collected = await collectVaultPayload(deps);
    expect(collected?.documents).toBe(1);
    expect(collected?.unreadable).toBe(1);

    // The index that travels with the payload lists only what it can open.
    const target = fakeDeps(0);
    await installVaultPayload(collected!.payload, target);
    expect((await listDocuments(target)).map((d) => d.id)).toEqual([kept.id]);
  });
});

describe('installVaultPayload', () => {
  it('T4: restores into an empty vault on another device, re-sealed under that key', async () => {
    const source = fakeDeps(0x11);
    const meta = await addTextDocument('4471#', 'doorCode', 'Klubbdörr', source);
    const collected = await collectVaultPayload(source);

    const target = fakeDeps(0x77);
    const result = await installVaultPayload(collected!.payload, target);
    expect(result).toEqual({ added: 1, replaced: 0 });

    const list = await listDocuments(target);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(meta.id);
    // Sealed under the target's key, not the source's: the bytes on disk are
    // different, and the target can read them back.
    expect(target.readDocumentBytes(meta.id)).not.toEqual(source.readDocumentBytes(meta.id));
  });

  it('T5: merges rather than replacing — a document only on this device survives', async () => {
    const source = fakeDeps();
    const fromBundle = await addTextDocument('4471#', 'doorCode', 'Klubbdörr', source);
    const collected = await collectVaultPayload(source);

    const target = fakeDeps();
    const onlyHere = await addTextDocument('9988', 'membershipCard', 'Kort', target);

    const result = await installVaultPayload(collected!.payload, target);
    expect(result).toEqual({ added: 1, replaced: 0 });

    const ids = (await listDocuments(target)).map((d) => d.id).sort();
    expect(ids).toEqual([fromBundle.id, onlyHere.id].sort());
  });

  it('T6: restoring the same bundle twice replaces in place instead of duplicating', async () => {
    const source = fakeDeps();
    await addTextDocument('4471#', 'doorCode', 'Klubbdörr', source);
    const collected = await collectVaultPayload(source);

    const target = fakeDeps();
    await installVaultPayload(collected!.payload, target);
    const second = await installVaultPayload(collected!.payload, target);

    expect(second).toEqual({ added: 0, replaced: 1 });
    expect(await listDocuments(target)).toHaveLength(1);
  });

  it('T7: ignores a payload document with no index entry', async () => {
    const source = fakeDeps();
    await addTextDocument('4471#', 'doorCode', 'Klubbdörr', source);
    const collected = await collectVaultPayload(source);

    // Rewrite the payload's index to an empty one: the document bytes are
    // still there, but nothing describes them.
    const stripped = packVaultPayload({
      indexJson: JSON.stringify({ documents: [] }),
      documents: unpackVaultPayload(collected!.payload).documents,
    });

    const target = fakeDeps();
    expect(await installVaultPayload(stripped, target)).toEqual({ added: 0, replaced: 0 });
    expect(await listDocuments(target)).toEqual([]);
  });
});
