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

const LAST_BACKUP_SETTING_KEY = 'lastBackupAt';

export type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'export-success' }
  | { kind: 'export-failed' }
  | { kind: 'restore-cancelled' }
  | { kind: 'restore-invalid' }
  | { kind: 'restore-newer-schema' }
  | { kind: 'restore-success' }
  | { kind: 'restore-failed' };

function bundleFilename(kind: BackupKind): string {
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
    }
  })();

  return { exportBundle, planRestore, confirmRestore, status, statusText, lastBackupAt };
}
