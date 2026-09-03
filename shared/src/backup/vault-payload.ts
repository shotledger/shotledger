// The plaintext side of the vault section of a backup bundle: the vault's
// index JSON plus one entry per document, packed with the same container
// format the bundle itself uses (container.ts). These bytes exist only in
// memory — `vault-crypt.ts` seals them under a passphrase-derived key before
// anything reaches the filesystem. See docs/specs/backup-export-spec.md.
import { packContainer, unpackContainer, InvalidContainerError } from './container';

/** Container entry inside the *bundle* holding the sealed vault payload. */
export const VAULT_ENTRY_NAME = 'vault/payload.enc';

/** Entry names inside the *payload* (one nested container). */
export const VAULT_PAYLOAD_INDEX_NAME = 'index.json';
export const VAULT_PAYLOAD_DOCUMENT_PREFIX = 'documents/';

export interface VaultPayloadDocument {
  id: string;
  bytes: Uint8Array;
}

export interface VaultPayload {
  /** The vault index, decrypted, as JSON text (document metadata only). */
  indexJson: string;
  documents: VaultPayloadDocument[];
}

export function vaultDocumentEntryName(id: string): string {
  return `${VAULT_PAYLOAD_DOCUMENT_PREFIX}${id}`;
}

export function packVaultPayload(payload: VaultPayload): Uint8Array {
  const encoder = new TextEncoder();
  return packContainer([
    { name: VAULT_PAYLOAD_INDEX_NAME, data: encoder.encode(payload.indexJson) },
    ...payload.documents.map((d) => ({ name: vaultDocumentEntryName(d.id), data: d.bytes })),
  ]);
}

export function unpackVaultPayload(bytes: Uint8Array): VaultPayload {
  const entries = unpackContainer(bytes);
  const index = entries.find((e) => e.name === VAULT_PAYLOAD_INDEX_NAME);
  if (!index) {
    throw new InvalidContainerError('vault payload has no index entry');
  }
  const documents = entries
    .filter((e) => e.name.startsWith(VAULT_PAYLOAD_DOCUMENT_PREFIX))
    .map((e) => ({ id: e.name.slice(VAULT_PAYLOAD_DOCUMENT_PREFIX.length), bytes: e.data }))
    .filter((d) => d.id.length > 0);

  return { indexJson: new TextDecoder().decode(index.data), documents };
}
