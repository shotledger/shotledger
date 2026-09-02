// Settings-screen glue for backup export/import (plan.md v2 "Backup export/
// import"). Mirrors features/csv/use-csv-export-import.ts's shape: a
// preview/confirm split for restore (`planRestore` never touches the DB,
// `confirmRestore` applies it), i18n'd status text, and a "last backup"
// timestamp persisted via the settings table.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupKind } from '@shotledger/shared';

import { db, rawDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { buildBackupBundle } from '@/db/backup/export-bundle';
import { inspectBundle, restoreBundle, type RestorePreview } from '@/db/backup/restore-bundle';
import { pickBundleBytes, shareBundle } from '@/platform/backup-fs';
import { isFolderSaveSupported, pickFolder, saveBytesToFolder } from '@/platform/save-to-folder';

import { reduceFolderState } from './folder-state';

const LAST_BACKUP_SETTING_KEY = 'lastBackupAt';
const FOLDER_SETTING_KEY = 'backupFolderUri';

export type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'export-success' }
  | { kind: 'export-failed' }
  | { kind: 'restore-cancelled' }
  | { kind: 'restore-invalid' }
  | { kind: 'restore-newer-schema' }
  | { kind: 'restore-success' }
  | { kind: 'restore-failed' }
  | { kind: 'folder-save-success' }
  | { kind: 'folder-save-ios-fallback' }
  | { kind: 'folder-save-cancelled' }
  | { kind: 'folder-save-failed' };

export function bundleFilename(kind: BackupKind): string {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = kind === 'database+photos' ? 'with-photos' : 'database';
  return `shotledger-backup-${suffix}-${date}.shotledger`;
}

export function useBackupExportImport() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BackupStatus>({ kind: 'idle' });
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

  async function exportBundle(kind: BackupKind) {
    if (!db || !rawDb) {
      setStatus({ kind: 'export-failed' });
      return;
    }
    try {
      const bytes = await buildBackupBundle(rawDb, kind);
      const ok = await shareBundle(bytes, bundleFilename(kind));
      if (ok) {
        const now = new Date().toISOString();
        setSetting(db, LAST_BACKUP_SETTING_KEY, now);
        setLastBackupAt(now);
      }
      setStatus(ok ? { kind: 'export-success' } : { kind: 'export-failed' });
    } catch {
      setStatus({ kind: 'export-failed' });
    }
  }

  /** Saves a bundle directly into a folder the user picks (or the one
   * already remembered), instead of the share sheet. On iOS/web, where
   * there's no folder-pick-and-write API, this falls back to the share
   * sheet and reports that in `status`. */
  async function saveBundleToFolder(kind: BackupKind) {
    if (!db || !rawDb) {
      setStatus({ kind: 'folder-save-failed' });
      return;
    }
    if (!isFolderSaveSupported) {
      const bytes = await buildBackupBundle(rawDb, kind);
      const ok = await shareBundle(bytes, bundleFilename(kind));
      setStatus(ok ? { kind: 'folder-save-ios-fallback' } : { kind: 'folder-save-failed' });
      return;
    }
    try {
      let target = folderUri;
      if (!target) {
        const picked = await pickFolder();
        if (!picked) {
          setStatus({ kind: 'folder-save-cancelled' });
          return;
        }
        persistFolder(reduceFolderState(target, { type: 'pick-succeeded', folderUri: picked }));
        target = picked;
      }
      const bytes = await buildBackupBundle(rawDb, kind);
      const ok = await saveBytesToFolder(target, bytes, bundleFilename(kind));
      if (ok) {
        const now = new Date().toISOString();
        setSetting(db, LAST_BACKUP_SETTING_KEY, now);
        setLastBackupAt(now);
        persistFolder(reduceFolderState(target, { type: 'write-succeeded' }));
      } else {
        // The folder may no longer be accessible — forget it so the next
        // attempt re-prompts instead of repeating the same failure.
        persistFolder(reduceFolderState(target, { type: 'write-failed' }));
      }
      setStatus(ok ? { kind: 'folder-save-success' } : { kind: 'folder-save-failed' });
    } catch {
      setStatus({ kind: 'folder-save-failed' });
    }
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

  /** Applies a plan from `planRestore` that the caller already confirmed
   * with the user. Replaces the entire database — never a merge. */
  async function confirmRestore(bytes: Uint8Array) {
    if (!rawDb) {
      setStatus({ kind: 'restore-failed' });
      return;
    }
    try {
      const ok = await restoreBundle(rawDb, bytes);
      setStatus(ok ? { kind: 'restore-success' } : { kind: 'restore-failed' });
    } catch {
      setStatus({ kind: 'restore-failed' });
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
      case 'restore-cancelled':
        return t('backup.restoreCancelled');
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
      case 'folder-save-cancelled':
        return t('backup.folderSaveCancelled');
      case 'folder-save-failed':
        return t('backup.folderSaveFailed');
    }
  })();

  return {
    exportBundle,
    saveBundleToFolder,
    changeFolder,
    forgetFolder,
    planRestore,
    confirmRestore,
    status,
    statusText,
    lastBackupAt,
    folderUri,
    isFolderSaveSupported,
  };
}
