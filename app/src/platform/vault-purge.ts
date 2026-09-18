// One-shot cleanup for the removed document Vault (issue #276). The Vault's
// encrypted files lived in `files/vault/` and its AES key in secure storage;
// neither is reachable any more, so both are deleted on first launch of a
// build that no longer has the feature. Runs on every launch because it is
// cheap and idempotent — the directory and the key are gone after the first.
//
// There is no rescue path here by design: the maintainer exports anything
// worth keeping before installing this build (see the PR for #276).
import { Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const VAULT_DIR_NAME = 'vault';
const VAULT_KEY_SECURE_STORE_KEY = 'vault_aes_key_v1';

export async function purgeRemovedVaultStorage(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, VAULT_DIR_NAME);
    if (dir.exists) dir.delete();
  } catch {
    // Best-effort: a failure here must never block app start.
  }
  try {
    await SecureStore.deleteItemAsync(VAULT_KEY_SECURE_STORE_KEY);
  } catch {
    // Same posture — the key is inert without the files it decrypted.
  }
}
