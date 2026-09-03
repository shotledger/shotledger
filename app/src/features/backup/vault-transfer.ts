// Moving the vault in and out of a backup bundle.
//
// The vault's own AES-256 key never leaves the platform keystore, so a bundle
// cannot carry vault ciphertext as-is — nothing else could ever open it.
// Export therefore decrypts each document with the device key *in memory*,
// packs the plaintext into one payload, and hands it to the caller to seal
// under a passphrase-derived key; no plaintext ever touches the filesystem.
// Restore reverses that and re-seals every document under *this* device's
// key, so the restored vault behaves like any other vault afterwards.
//
// See docs/specs/backup-export-spec.md ("Vault opt-in").
import {
  open,
  packVaultPayload,
  seal,
  unpackVaultPayload,
  type VaultPayloadDocument,
} from '@shotledger/shared';

import {
  defaultVaultStoreDeps,
  loadIndex,
  saveIndex,
  type VaultStoreDeps,
} from '@/features/vault/vault-store';
import type { VaultDocumentMeta, VaultIndex } from '@/features/vault/types';

export interface CollectedVaultPayload {
  /** Plaintext payload bytes — seal these before they go anywhere. */
  payload: Uint8Array;
  documents: number;
  /** Documents listed in the index whose encrypted file could not be read. */
  unreadable: number;
}

/**
 * Decrypts the whole vault into one in-memory payload. Returns `null` when
 * the vault is empty, so an opt-in with nothing to include does not add an
 * empty encrypted section to the bundle.
 */
export async function collectVaultPayload(
  deps: VaultStoreDeps = defaultVaultStoreDeps(),
): Promise<CollectedVaultPayload | null> {
  const index = await loadIndex(deps);
  if (index.documents.length === 0) return null;

  const key = await deps.getKey();
  const documents: VaultPayloadDocument[] = [];
  const kept: VaultDocumentMeta[] = [];
  let unreadable = 0;

  for (const meta of index.documents) {
    const sealed = deps.readDocumentBytes(meta.id);
    if (!sealed) {
      unreadable++;
      continue;
    }
    try {
      documents.push({ id: meta.id, bytes: await open(sealed, key, deps.provider) });
      kept.push(meta);
    } catch {
      // A document this device can no longer decrypt cannot be re-wrapped;
      // leave it out rather than shipping bytes the bundle cannot open.
      unreadable++;
    }
  }

  if (documents.length === 0) return null;

  const payload = packVaultPayload({
    indexJson: JSON.stringify({ documents: kept } satisfies VaultIndex),
    documents,
  });
  return { payload, documents: documents.length, unreadable };
}

export interface InstalledVault {
  added: number;
  replaced: number;
}

/**
 * Writes a decrypted payload into this device's vault, re-sealing every
 * document under the device key.
 *
 * **Merge, never replace.** The database restore is a full replace, but the
 * vault is not: a document that exists only on this device (a licence card
 * photographed here and nowhere else) would be unrecoverable if a restore
 * wiped it. Documents are keyed by their uuidv7 id, so an id already present
 * is the same document and is overwritten; every other id is added.
 */
export async function installVaultPayload(
  payload: Uint8Array,
  deps: VaultStoreDeps = defaultVaultStoreDeps(),
): Promise<InstalledVault> {
  const incoming = unpackVaultPayload(payload);
  const incomingIndex = JSON.parse(incoming.indexJson) as VaultIndex;
  const metaById = new Map(incomingIndex.documents.map((d) => [d.id, d]));

  const key = await deps.getKey();
  const existing = await loadIndex(deps);
  const existingIds = new Set(existing.documents.map((d) => d.id));

  let added = 0;
  let replaced = 0;
  const merged: VaultDocumentMeta[] = [...existing.documents];

  for (const document of incoming.documents) {
    const meta = metaById.get(document.id);
    if (!meta) continue; // payload document with no index entry — nothing to show it under
    deps.writeDocumentBytes(document.id, await seal(document.bytes, key, deps.provider));
    if (existingIds.has(document.id)) {
      replaced++;
      const at = merged.findIndex((d) => d.id === document.id);
      merged[at] = meta;
    } else {
      added++;
      merged.push(meta);
    }
  }

  await saveIndex({ documents: merged }, deps);
  return { added, replaced };
}
