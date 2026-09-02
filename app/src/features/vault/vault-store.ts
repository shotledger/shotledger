// Vault document CRUD: an encrypted JSON index (labels/types/dates) plus one
// encrypted file per document. Deliberately not a Drizzle table — nothing
// here ever touches app/src/db, so it structurally cannot end up in a sync
// push/pull or CSV export, per plan.md v2 ("never synced"). Every dependency
// is injectable (`VaultStoreDeps`) so this module is testable with fakes;
// `defaultVaultStoreDeps()` wires the real expo-crypto/expo-secure-store/
// expo-file-system-backed implementations for app code.
import { File } from 'expo-file-system';
import { uuidv7 } from 'uuidv7';
import { open, seal, type AesGcmProvider } from '@shotledger/shared';

import {
  deleteFileIfExists,
  documentFile,
  indexFile,
  readFileBytes,
  writeFileBytes,
} from '@/platform/vault-fs';
import { vaultCryptoProvider, type VaultKey } from '@/platform/vault-crypto';
import { getOrCreateVaultKey } from '@/platform/vault-key';

import {
  EMPTY_VAULT_INDEX,
  type VaultContentType,
  type VaultDocumentKind,
  type VaultDocumentMeta,
  type VaultIndex,
} from './types';

export interface VaultStoreDeps {
  getKey(): Promise<VaultKey>;
  provider: AesGcmProvider<VaultKey>;
  readIndexBytes(): Uint8Array | null;
  writeIndexBytes(bytes: Uint8Array): void;
  readDocumentBytes(id: string): Uint8Array | null;
  writeDocumentBytes(id: string, bytes: Uint8Array): void;
  deleteDocumentBytes(id: string): void;
  /** Reads an arbitrary source file (e.g. an image-picker result URI). */
  readSourceBytes(uri: string): Promise<Uint8Array>;
}

export function defaultVaultStoreDeps(): VaultStoreDeps {
  return {
    getKey: getOrCreateVaultKey,
    provider: vaultCryptoProvider,
    readIndexBytes: () => readFileBytes(indexFile()),
    writeIndexBytes: (bytes) => writeFileBytes(indexFile(), bytes),
    readDocumentBytes: (id) => readFileBytes(documentFile(id)),
    writeDocumentBytes: (id, bytes) => writeFileBytes(documentFile(id), bytes),
    deleteDocumentBytes: (id) => deleteFileIfExists(documentFile(id)),
    readSourceBytes: async (uri) => new File(uri).bytes(),
  };
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

async function loadIndex(deps: VaultStoreDeps): Promise<VaultIndex> {
  const sealed = deps.readIndexBytes();
  if (!sealed) return EMPTY_VAULT_INDEX;
  const key = await deps.getKey();
  const plaintext = await open(sealed, key, deps.provider);
  return JSON.parse(utf8Decoder.decode(plaintext)) as VaultIndex;
}

async function saveIndex(index: VaultIndex, deps: VaultStoreDeps): Promise<void> {
  const key = await deps.getKey();
  const plaintext = utf8Encoder.encode(JSON.stringify(index));
  const sealed = await seal(plaintext, key, deps.provider);
  deps.writeIndexBytes(sealed);
}

export async function listDocuments(deps: VaultStoreDeps = defaultVaultStoreDeps()) {
  const index = await loadIndex(deps);
  return [...index.documents].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

async function addDocument(
  contentType: VaultContentType,
  kind: VaultDocumentKind,
  label: string,
  plaintext: Uint8Array,
  deps: VaultStoreDeps,
): Promise<VaultDocumentMeta> {
  const key = await deps.getKey();
  const sealed = await seal(plaintext, key, deps.provider);

  const meta: VaultDocumentMeta = {
    id: uuidv7(),
    kind,
    contentType,
    label,
    addedAt: new Date().toISOString(),
  };
  deps.writeDocumentBytes(meta.id, sealed);

  const index = await loadIndex(deps);
  await saveIndex({ documents: [...index.documents, meta] }, deps);
  return meta;
}

export async function addPhotoDocument(
  sourceUri: string,
  kind: VaultDocumentKind,
  label: string,
  deps: VaultStoreDeps = defaultVaultStoreDeps(),
): Promise<VaultDocumentMeta> {
  const bytes = await deps.readSourceBytes(sourceUri);
  return addDocument('image', kind, label, bytes, deps);
}

export async function addTextDocument(
  text: string,
  kind: VaultDocumentKind,
  label: string,
  deps: VaultStoreDeps = defaultVaultStoreDeps(),
): Promise<VaultDocumentMeta> {
  return addDocument('text', kind, label, utf8Encoder.encode(text), deps);
}

export interface VaultDocumentContent {
  meta: VaultDocumentMeta;
  bytes: Uint8Array;
}

/** Decrypts a document to memory. Never writes plaintext to disk. */
export async function getDocumentContent(
  id: string,
  deps: VaultStoreDeps = defaultVaultStoreDeps(),
): Promise<VaultDocumentContent | null> {
  const index = await loadIndex(deps);
  const meta = index.documents.find((d) => d.id === id);
  if (!meta) return null;

  const sealed = deps.readDocumentBytes(id);
  if (!sealed) return null;

  const key = await deps.getKey();
  const bytes = await open(sealed, key, deps.provider);
  return { meta, bytes };
}

export async function deleteDocument(
  id: string,
  deps: VaultStoreDeps = defaultVaultStoreDeps(),
): Promise<void> {
  deps.deleteDocumentBytes(id);
  const index = await loadIndex(deps);
  await saveIndex({ documents: index.documents.filter((d) => d.id !== id) }, deps);
}
