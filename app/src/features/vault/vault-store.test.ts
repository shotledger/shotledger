// Vault store CRUD, with fakes for crypto and the filesystem — the crypto
// primitive itself is gauntlet-tested in shared/src/vault/envelope.test.ts;
// this file proves the index/blob bookkeeping only (per
// docs/specs/document-vault-evidence.md).
import {
  addPhotoDocument,
  addTextDocument,
  deleteDocument,
  getDocumentContent,
  listDocuments,
  type VaultStoreDeps,
} from './vault-store';

// Identity "encryption" — records what was sealed without touching AES-GCM,
// since that's already covered elsewhere. Still exercises the same
// AesGcmProvider call shape the real provider uses.
const identityProvider = {
  randomBytes: (n: number) => new Uint8Array(n),
  async encrypt(plaintext: Uint8Array) {
    return { ciphertext: plaintext, tag: new Uint8Array(16) };
  },
  async decrypt(ciphertext: Uint8Array) {
    return ciphertext;
  },
};

function fakeDeps(): VaultStoreDeps {
  const files = new Map<string, Uint8Array>();
  const sources = new Map<string, Uint8Array>();
  sources.set('file:///picked-photo.jpg', new Uint8Array([1, 2, 3, 4]));

  return {
    getKey: async () => ({}) as never,
    provider: identityProvider,
    readIndexBytes: () => files.get('index') ?? null,
    writeIndexBytes: (bytes) => void files.set('index', bytes),
    readDocumentBytes: (id) => files.get(`doc:${id}`) ?? null,
    writeDocumentBytes: (id, bytes) => void files.set(`doc:${id}`, bytes),
    deleteDocumentBytes: (id) => void files.delete(`doc:${id}`),
    readSourceBytes: async (uri) => {
      const bytes = sources.get(uri);
      if (!bytes) throw new Error(`no fake source for ${uri}`);
      return bytes;
    },
  };
}

describe('vault store CRUD', () => {
  it('lists no documents before anything is added', async () => {
    const deps = fakeDeps();
    expect(await listDocuments(deps)).toEqual([]);
  });

  it('adding a text document makes it listable and readable', async () => {
    const deps = fakeDeps();
    const meta = await addTextDocument('Portkod: 4471#', 'doorCode', 'Klubbdörr', deps);

    const list = await listDocuments(deps);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(meta);
    expect(meta.contentType).toBe('text');
    expect(meta.kind).toBe('doorCode');
    expect(meta.label).toBe('Klubbdörr');

    const content = await getDocumentContent(meta.id, deps);
    expect(content).not.toBeNull();
    expect(new TextDecoder().decode(content!.bytes)).toBe('Portkod: 4471#');
  });

  it('adding a photo document reads the source URI and encrypts its bytes', async () => {
    const deps = fakeDeps();
    const meta = await addPhotoDocument('file:///picked-photo.jpg', 'license', 'Vapenlicens', deps);

    expect(meta.contentType).toBe('image');
    const content = await getDocumentContent(meta.id, deps);
    expect(content?.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('adding multiple documents preserves all of them, newest first', async () => {
    const deps = fakeDeps();
    const first = await addTextDocument('first', 'other', 'A', deps);
    const second = await addTextDocument('second', 'other', 'B', deps);

    const list = await listDocuments(deps);
    expect(list.map((d) => d.id)).toEqual(
      [first, second].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).map((d) => d.id),
    );
    expect(list).toHaveLength(2);
  });

  it('deleting a document removes both the blob and the index entry', async () => {
    const deps = fakeDeps();
    const meta = await addTextDocument('secret', 'other', 'X', deps);

    await deleteDocument(meta.id, deps);

    expect(await listDocuments(deps)).toEqual([]);
    expect(await getDocumentContent(meta.id, deps)).toBeNull();
  });

  it('deleting a document leaves the others intact', async () => {
    const deps = fakeDeps();
    const keep = await addTextDocument('keep me', 'other', 'Keep', deps);
    const remove = await addTextDocument('remove me', 'other', 'Remove', deps);

    await deleteDocument(remove.id, deps);

    const list = await listDocuments(deps);
    expect(list.map((d) => d.id)).toEqual([keep.id]);
  });

  it('getDocumentContent returns null for an unknown id', async () => {
    const deps = fakeDeps();
    expect(await getDocumentContent('does-not-exist', deps)).toBeNull();
  });
});
