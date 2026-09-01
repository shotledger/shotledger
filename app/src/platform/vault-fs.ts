// Document-vault directory and file paths (plan.md v2). Everything the vault
// writes lives under one directory, `vault/`, inside the app's document
// directory — the Android backup-exclusion plugin
// (app/plugins/withVaultBackupExclusion.js) targets this exact path
// (`files/vault/`). Never read/written by anything outside
// app/src/features/vault and this module — in particular never by
// app/src/db (the synced/CSV-exported SQLite data) or app/src/features/export.
import { Directory, File, Paths } from 'expo-file-system';

const VAULT_DIR_NAME = 'vault';
const INDEX_FILE_NAME = 'index.enc';

export function vaultDirectory(): Directory {
  return new Directory(Paths.document, VAULT_DIR_NAME);
}

/** Creates the vault directory if it doesn't exist yet. Idempotent. */
export function ensureVaultDirectory(): Directory {
  const dir = vaultDirectory();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/** The single encrypted index file (document metadata — labels, types, dates). */
export function indexFile(): File {
  return new File(ensureVaultDirectory(), INDEX_FILE_NAME);
}

/** The encrypted blob for one document, named by its id (not by user-supplied label). */
export function documentFile(documentId: string): File {
  return new File(ensureVaultDirectory(), `${documentId}.enc`);
}

export function readFileBytes(file: File): Uint8Array | null {
  if (!file.exists) return null;
  return file.bytesSync();
}

export function writeFileBytes(file: File, bytes: Uint8Array): void {
  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }
  file.write(bytes);
}

export function deleteFileIfExists(file: File): void {
  if (file.exists) {
    file.delete();
  }
}
