// Settings-screen glue for backup export/import (plan.md v2 "Backup export/
// import"). Mirrors features/csv/use-csv-export-import.ts's shape: a
// preview/confirm split for restore (`planRestore` never touches the DB,
// `confirmRestore` applies it), i18n'd status text, and a "last backup"
// timestamp persisted via the settings table.
//
// Export scope is everything except the vault. The vault is included only
// when the user turns it on for that one export and supplies a passphrase —
// see docs/specs/backup-export-spec.md.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BackupVaultPassphraseError,
  openVaultSection,
  sealVaultSection,
  VAULT_KDF_NAME,
} from '@shotledger/shared';

import { db, rawDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { buildBackupBundle, type SealedVaultSectionForBundle } from '@/db/backup/export-bundle';
import {
  inspectBundle,
  readBundleVaultSection,
  restoreBundle,
  type RestorePreview,
} from '@/db/backup/restore-bundle';
import { pickBundleBytes, shareBundle } from '@/platform/backup-fs';
import { isFolderSaveSupported, pickFolder, saveBytesToFolder } from '@/platform/save-to-folder';
import { bundleVaultCryptoDeps } from '@/platform/vault-crypto';

import { reduceFolderState } from './folder-state';
import { collectVaultPayload, installVaultPayload } from './vault-transfer';

const LAST_BACKUP_SETTING_KEY = 'lastBackupAt';
const FOLDER_SETTING_KEY = 'backupFolderUri';

export type BackupDestination = 'share' | 'folder';

export interface BackupExportOptions {
  /** Series and target photos, local and synced. */
  includePhotos: boolean;
  /** Off unless the user turned it on for this one export. */
  includeVault: boolean;
  /** Only read when `includeVault` is true; never stored anywhere. */
  passphrase: string;
  destination: BackupDestination;
}

export const DEFAULT_EXPORT_OPTIONS: BackupExportOptions = {
  includePhotos: true,
  includeVault: false,
  passphrase: '',
  destination: 'share',
};

export type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'export-success' }
  | { kind: 'export-success-with-vault' }
  | { kind: 'export-vault-empty' }
  | { kind: 'export-failed' }
  | { kind: 'restore-cancelled' }
  | { kind: 'restore-invalid' }
  | { kind: 'restore-newer-schema' }
  | { kind: 'restore-success' }
  | { kind: 'restore-success-vault-merged' }
  | { kind: 'restore-success-vault-skipped' }
  | { kind: 'restore-vault-wrong-passphrase' }
  | { kind: 'restore-failed' }
  | { kind: 'folder-save-success' }
  | { kind: 'folder-save-ios-fallback' }
  | { kind: 'folder-save-cancelled' }
  | { kind: 'folder-save-failed' };

/** What a restore attempt did, so the caller can re-prompt for a passphrase
 * instead of guessing from a boolean. Nothing destructive has happened when
 * this is `wrong-passphrase`. */
export type RestoreOutcome =
  | { kind: 'ok'; vault: 'absent' | 'merged' | 'skipped' }
  | { kind: 'wrong-passphrase' }
  | { kind: 'failed' };

export function bundleFilename(options: { includePhotos: boolean; includeVault: boolean }): string {
  const date = new Date().toISOString().slice(0, 10);
  const parts = ['shotledger-backup'];
  parts.push(options.includePhotos ? 'with-photos' : 'database');
  if (options.includeVault) parts.push('vault');
  return `${parts.join('-')}-${date}.shotledger`;
}

export function useBackupExportImport() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BackupStatus>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() =>
    db ? getSetting<string | null>(db, LAST_BACKUP_SETTING_KEY, null) : null,
  );
  const [folderUri, setFolderUri] = useState<string | null>(() =>
    db ? getSetting<string | null>(db, FOLDER_SETTING_KEY, null) : null,
  );

  function persistFolder(next: string | null) {
    if (db) setSetting(db, FOLDER_SETTING_KEY, next);
    setFolderUri(next);
  }

  function recordBackupTimestamp() {
    if (!db) return;
    const now = new Date().toISOString();
    setSetting(db, LAST_BACKUP_SETTING_KEY, now);
    setLastBackupAt(now);
  }

  /** Decrypts the vault with the device key and re-seals it under the user's
   * passphrase. `null` means "nothing to include" (empty vault). */
  async function buildVaultSection(
    passphrase: string,
  ): Promise<SealedVaultSectionForBundle | null> {
    const collected = await collectVaultPayload();
    if (!collected) return null;
    const sealed = await sealVaultSection(collected.payload, passphrase, bundleVaultCryptoDeps);
    // Drop the plaintext copy as soon as it is sealed.
    collected.payload.fill(0);
    return {
      kdf: VAULT_KDF_NAME,
      saltHex: sealed.saltHex,
      iterations: sealed.iterations,
      documents: collected.documents,
      sealed: sealed.sealed,
    };
  }

  /** Builds and delivers a bundle. The vault is included only when
   * `options.includeVault` is set; the passphrase is used once and never
   * persisted. */
  async function exportBundle(options: BackupExportOptions): Promise<void> {
    if (!db || !rawDb) {
      setStatus({ kind: 'export-failed' });
      return;
    }

    setBusy(true);
    try {
      let vault: SealedVaultSectionForBundle | null = null;
      let vaultWasEmpty = false;
      if (options.includeVault) {
        vault = await buildVaultSection(options.passphrase);
        vaultWasEmpty = vault === null;
      }

      const bytes = await buildBackupBundle(rawDb, {
        kind: options.includePhotos ? 'database+photos' : 'database',
        ...(vault ? { vault } : {}),
      });
      const filename = bundleFilename({
        includePhotos: options.includePhotos,
        includeVault: vault !== null,
      });

      const delivered = await deliver(bytes, filename, options.destination);
      if (delivered === 'cancelled') {
        setStatus({ kind: 'folder-save-cancelled' });
        return;
      }
      if (delivered === 'failed') {
        setStatus(
          options.destination === 'folder'
            ? { kind: 'folder-save-failed' }
            : { kind: 'export-failed' },
        );
        return;
      }

      recordBackupTimestamp();
      if (delivered === 'ios-fallback') {
        setStatus({ kind: 'folder-save-ios-fallback' });
      } else if (vaultWasEmpty) {
        setStatus({ kind: 'export-vault-empty' });
      } else if (vault) {
        setStatus({ kind: 'export-success-with-vault' });
      } else {
        setStatus(
          options.destination === 'folder'
            ? { kind: 'folder-save-success' }
            : { kind: 'export-success' },
        );
      }
    } catch {
      setStatus({ kind: 'export-failed' });
    } finally {
      setBusy(false);
    }
  }

  type Delivery = 'ok' | 'ios-fallback' | 'cancelled' | 'failed';

  async function deliver(
    bytes: Uint8Array,
    filename: string,
    destination: BackupDestination,
  ): Promise<Delivery> {
    if (destination === 'share') {
      return (await shareBundle(bytes, filename)) ? 'ok' : 'failed';
    }
    // Folder: on iOS/web there is no folder-pick-and-write API, so fall back
    // to the share sheet and say so.
    if (!isFolderSaveSupported) {
      return (await shareBundle(bytes, filename)) ? 'ios-fallback' : 'failed';
    }
    let target = folderUri;
    if (!target) {
      const picked = await pickFolder();
      if (!picked) return 'cancelled';
      persistFolder(reduceFolderState(target, { type: 'pick-succeeded', folderUri: picked }));
      target = picked;
    }
    const ok = await saveBytesToFolder(target, bytes, filename);
    // The folder may no longer be accessible — forget it so the next attempt
    // re-prompts instead of repeating the same failure.
    persistFolder(
      reduceFolderState(target, ok ? { type: 'write-succeeded' } : { type: 'write-failed' }),
    );
    return ok ? 'ok' : 'failed';
  }

  /** Lets the user pick a different folder, replacing any remembered one. */
  async function changeFolder(): Promise<void> {
    const picked = await pickFolder();
    if (!picked) return;
    persistFolder(reduceFolderState(folderUri, { type: 'pick-succeeded', folderUri: picked }));
  }

  function forgetFolder(): void {
    persistFolder(reduceFolderState(folderUri, { type: 'forget' }));
  }

  /** Picks a bundle and validates it, without touching the DB. Returns
   * `null` if the user cancelled the picker. */
  async function planRestore(): Promise<{ preview: RestorePreview; bytes: Uint8Array } | null> {
    const picked = await pickBundleBytes();
    if (!picked) {
      setStatus({ kind: 'restore-cancelled' });
      return null;
    }
    const preview = inspectBundle(picked.bytes);
    if (!preview) {
      setStatus({ kind: 'restore-invalid' });
      return null;
    }
    if (preview.compatibility === 'newer') {
      setStatus({ kind: 'restore-newer-schema' });
      return null;
    }
    return { preview, bytes: picked.bytes };
  }

  /**
   * Applies a plan from `planRestore` that the caller already confirmed with
   * the user. Replaces the entire database — never a merge. The vault is the
   * one exception: its documents are merged, because a document that exists
   * only on this device would otherwise be destroyed unrecoverably.
   *
   * `passphrase` is `null` to restore everything except the vault. A wrong
   * passphrase is detected *before* anything is written, so the caller can
   * re-prompt with nothing lost.
   */
  async function confirmRestore(
    bytes: Uint8Array,
    passphrase: string | null,
  ): Promise<RestoreOutcome> {
    if (!rawDb) {
      setStatus({ kind: 'restore-failed' });
      return { kind: 'failed' };
    }

    const preview = inspectBundle(bytes);
    const vaultInfo = preview?.manifest.vault;
    const sealedVault = vaultInfo ? readBundleVaultSection(bytes) : null;

    setBusy(true);
    try {
      // Decrypt first: a wrong passphrase must not cost the user their data.
      let vaultPayload: Uint8Array | null = null;
      if (vaultInfo && sealedVault && passphrase !== null) {
        try {
          vaultPayload = await openVaultSection(
            sealedVault,
            passphrase,
            vaultInfo.saltHex,
            vaultInfo.iterations,
            bundleVaultCryptoDeps,
          );
        } catch (error) {
          if (error instanceof BackupVaultPassphraseError) {
            setStatus({ kind: 'restore-vault-wrong-passphrase' });
            return { kind: 'wrong-passphrase' };
          }
          throw error;
        }
      }

      const ok = await restoreBundle(rawDb, bytes);
      if (!ok) {
        setStatus({ kind: 'restore-failed' });
        return { kind: 'failed' };
      }

      if (vaultPayload) {
        await installVaultPayload(vaultPayload);
        vaultPayload.fill(0);
        setStatus({ kind: 'restore-success-vault-merged' });
        return { kind: 'ok', vault: 'merged' };
      }
      if (sealedVault) {
        setStatus({ kind: 'restore-success-vault-skipped' });
        return { kind: 'ok', vault: 'skipped' };
      }
      setStatus({ kind: 'restore-success' });
      return { kind: 'ok', vault: 'absent' };
    } catch {
      setStatus({ kind: 'restore-failed' });
      return { kind: 'failed' };
    } finally {
      setBusy(false);
    }
  }

  const statusText: string | null = (() => {
    switch (status.kind) {
      case 'idle':
        return null;
      case 'export-success':
        return t('backup.exportSuccess');
      case 'export-success-with-vault':
        return t('backup.exportSuccessWithVault');
      case 'export-vault-empty':
        return t('backup.exportVaultEmpty');
      case 'export-failed':
        return t('backup.exportFailed');
      case 'restore-cancelled':
        return t('backup.restoreCancelled');
      case 'restore-invalid':
        return t('backup.restoreInvalid');
      case 'restore-newer-schema':
        return t('backup.restoreNewerSchema');
      case 'restore-success':
        return t('backup.restoreSuccess');
      case 'restore-success-vault-merged':
        return t('backup.restoreSuccessVaultMerged');
      case 'restore-success-vault-skipped':
        return t('backup.restoreSuccessVaultSkipped');
      case 'restore-vault-wrong-passphrase':
        return t('backup.restoreVaultWrongPassphrase');
      case 'restore-failed':
        return t('backup.restoreFailed');
      case 'folder-save-success':
        return t('backup.folderSaveSuccess');
      case 'folder-save-ios-fallback':
        return t('backup.folderSaveIosFallback');
      case 'folder-save-cancelled':
        return t('backup.folderSaveCancelled');
      case 'folder-save-failed':
        return t('backup.folderSaveFailed');
    }
  })();

  return {
    exportBundle,
    changeFolder,
    forgetFolder,
    planRestore,
    confirmRestore,
    status,
    statusText,
    busy,
    lastBackupAt,
    folderUri,
    isFolderSaveSupported,
  };
}
