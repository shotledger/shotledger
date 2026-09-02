// Vault key lifecycle (plan.md v2, docs/specs/document-vault-spec.md "Key
// lifecycle"). One AES-256 key per install, generated once and held only in
// expo-secure-store (Android Keystore-backed, hardware-backed on API 23+;
// iOS Keychain) — never written to the app DB, CSV export, or any log.
import * as SecureStore from 'expo-secure-store';

import { exportVaultKey, generateVaultKey, importVaultKey, type VaultKey } from './vault-crypto';

const SECURE_STORE_KEY = 'vault_aes_key_v1';

let cached: VaultKey | null = null;

/**
 * Returns the vault's AES-256 key, generating and persisting one on first
 * call. Regenerates (and re-persists) if the stored value is present but
 * unreadable/corrupt rather than throwing — a missing key means an empty
 * vault, never a stuck one.
 */
export async function getOrCreateVaultKey(): Promise<VaultKey> {
  if (cached) return cached;

  const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY).catch(() => null);
  if (stored) {
    try {
      cached = await importVaultKey(stored);
      return cached;
    } catch {
      // Fall through and regenerate — see doc-comment above.
    }
  }

  const key = await generateVaultKey();
  const raw = await exportVaultKey(key);
  await SecureStore.setItemAsync(SECURE_STORE_KEY, raw);
  cached = key;
  return key;
}

/** Test/dev-only: forces the next `getOrCreateVaultKey()` to re-read secure-store. */
export function clearVaultKeyCache(): void {
  cached = null;
}
