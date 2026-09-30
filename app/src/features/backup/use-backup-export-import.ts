// Settings-screen glue for backup export/import. Mirrors
// features/csv/use-csv-export-import.ts's shape: a
// preview/confirm split for restore (`planRestore` never touches the DB,
// `confirmRestore` applies it), i18n'd status text, and a "last backup"
// timestamp persisted via the settings table.
//
// Export scope is everything the app stores — see
// docs/specs/backup-export-spec.md.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { db, rawDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { buildBackupBundle } from '@/db/backup/export-bundle';
import { inspectBundle, restoreBundle, type RestorePreview } from '@/db/backup/restore-bundle';
import { pickBundleBytes, shareBundle } from '@/platform/backup-fs';
import { localDateStamp } from '@/features/export/local-date-stamp';
import { isFolderSaveSupported, pickFolder, saveBytesToFolder } from '@/platform/save-to-folder';

import { reduceFolderState } from './folder-state';

const LAST_BACKUP_SETTING_KEY = 'lastBackupAt';
const FOLDER_SETTING_KEY = 'backupFolderUri';

export type BackupDestination = 'share' | 'folder';

export interface BackupExportOptions {
  /** Series and target photos, local and synced. */
  includePhotos: boolean;
  destination: BackupDestination;
}

export const DEFAULT_EXPORT_OPTIONS: BackupExportOptions = {
  includePhotos: true,
  destination: 'share',
};

export type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'export-success' }
  | { kind: 'export-failed' }
  | { kind: 'restore-canceled' }
  | { kind: 'restore-invalid' }
  | { kind: 'restore-newer-schema' }
  | { kind: 'restore-success' }
  | { kind: 'restore-failed' }
  | { kind: 'folder-save-success' }
  | { kind: 'folder-save-ios-fallback' }
  | { kind: 'folder-save-canceled' }
  | { kind: 'folder-save-failed' };

export type RestoreOutcome = { kind: 'ok' } | { kind: 'failed' };

export function bundleFilename(options: { includePhotos: boolean }): string {
  const date = localDateStamp();
  const scope = options.includePhotos ? 'with-photos' : 'database';
  return `shotledger-backup-${scope}-${date}.shotledger`;
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

  /** Builds and delivers a bundle. */
  async function exportBundle(options: BackupExportOptions): Promise<void> {
    if (!db || !rawDb) {
      setStatus({ kind: 'export-failed' });
      return;
    }

    setBusy(true);
    try {
      const bytes = await buildBackupBundle(rawDb, {
        kind: options.includePhotos ? 'database+photos' : 'database',
      });
      const filename = bundleFilename({ includePhotos: options.includePhotos });

      const delivered = await deliver(bytes, filename, options.destination);
      if (delivered === 'canceled') {
        setStatus({ kind: 'folder-save-canceled' });
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

  type Delivery = 'ok' | 'ios-fallback' | 'canceled' | 'failed';

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
      if (!picked) return 'canceled';
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
   * `null` if the user canceled the picker. */
  async function planRestore(): Promise<{ preview: RestorePreview; bytes: Uint8Array } | null> {
    const picked = await pickBundleBytes();
    if (!picked) {
      setStatus({ kind: 'restore-canceled' });
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
   * the user. Replaces the entire database — never a merge. A bundle written
   * by a build that still had the Vault carries a `vault/payload.enc` entry;
   * it is ignored (issue #276).
   */
  async function confirmRestore(bytes: Uint8Array): Promise<RestoreOutcome> {
    if (!rawDb) {
      setStatus({ kind: 'restore-failed' });
      return { kind: 'failed' };
    }

    setBusy(true);
    try {
      const ok = await restoreBundle(rawDb, bytes);
      if (!ok) {
        setStatus({ kind: 'restore-failed' });
        return { kind: 'failed' };
      }

      setStatus({ kind: 'restore-success' });
      return { kind: 'ok' };
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
      case 'export-failed':
        return t('backup.exportFailed');
      case 'restore-canceled':
        return t('backup.restoreCanceled');
      case 'restore-invalid':
        return t('backup.restoreInvalid');
      case 'restore-newer-schema':
        return t('backup.restoreNewerSchema');
      case 'restore-success':
        return t('backup.restoreSuccess');
      case 'restore-failed':
        return t('backup.restoreFailed');
      case 'folder-save-success':
        return t('backup.folderSaveSuccess');
      case 'folder-save-ios-fallback':
        return t('backup.folderSaveIosFallback');
      case 'folder-save-canceled':
        return t('backup.folderSaveCanceled');
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
