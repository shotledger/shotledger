// The Settings → Backup card. Moved out of app/src/app/(tabs)/settings.tsx
// unchanged in behaviour except for what this branch adds, so that the
// backup feature owns its own UI and Settings keeps only two rows.
//
// Backup scope: everything the app stores except the Vault. The Vault goes in
// only when the user turns it on for one export and supplies a passphrase —
// see backup-options-dialog.tsx and docs/specs/backup-export-spec.md.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import type { RestorePreview } from '@/db/backup/restore-bundle';

import { BackupOptionsDialog } from './backup-options-dialog';
import { RestorePassphraseDialog } from './restore-passphrase-dialog';
import { useBackupExportImport, type BackupExportOptions } from './use-backup-export-import';

interface PendingRestore {
  preview: RestorePreview;
  bytes: Uint8Array;
}

export function BackupCard() {
  const { t } = useTranslation();
  const {
    exportBundle,
    changeFolder,
    forgetFolder,
    planRestore,
    confirmRestore,
    statusText,
    busy,
    lastBackupAt,
    folderUri,
    isFolderSaveSupported,
  } = useBackupExportImport();

  const [optionsVisible, setOptionsVisible] = useState(false);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [wrongPassphrase, setWrongPassphrase] = useState(false);

  function onConfirmOptions(options: BackupExportOptions) {
    setOptionsVisible(false);
    void exportBundle(options);
  }

  function restoreDoneAlert() {
    Alert.alert(t('backup.restoreRestartTitle'), t('backup.restoreRestartBody'), [
      { text: t('backup.restoreRestartAction') },
    ]);
  }

  async function runRestore(plan: PendingRestore, passphrase: string | null) {
    const outcome = await confirmRestore(plan.bytes, passphrase);
    if (outcome.kind === 'wrong-passphrase') {
      setWrongPassphrase(true);
      return;
    }
    setPending(null);
    setWrongPassphrase(false);
    if (outcome.kind === 'ok') restoreDoneAlert();
  }

  async function onRestore() {
    const planned = await planRestore();
    if (!planned) return;
    const { manifest, hasVault } = planned.preview;
    const photosNote =
      manifest.kind === 'database+photos'
        ? t('backup.restorePreviewPhotosNote', { count: manifest.counts.photos })
        : '';
    const vaultNote = hasVault
      ? t('backup.restorePreviewVaultNote', { count: manifest.vault?.documents ?? 0 })
      : t('backup.restorePreviewNoVaultNote');

    Alert.alert(
      t('backup.restorePreviewTitle'),
      t('backup.restorePreviewBody', {
        date: new Date(manifest.createdAt).toLocaleDateString(),
        sessions: manifest.counts.sessions,
        series: manifest.counts.series,
        shots: manifest.counts.shots,
        firearms: manifest.counts.firearms,
        photosNote,
        vaultNote,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('backup.restoreConfirmAction'),
          style: 'destructive',
          onPress: () => {
            const plan = { preview: planned.preview, bytes: planned.bytes };
            setPending(plan);
            setWrongPassphrase(false);
            // A bundle with a Vault needs the passphrase before anything is
            // written; one without goes straight through.
            if (!hasVault) void runRestore(plan, null);
          },
        },
      ],
    );
  }

  return (
    <Card>
      <ThemedText type="smallBold">{t('backup.sectionTitle')}</ThemedText>
      <ListRow
        title={t('backup.exportTitle')}
        subtitle={t('backup.exportSubtitle')}
        onPress={() => setOptionsVisible(true)}
        testID="settings-backup-export"
      />
      <ListRow
        title={t('backup.restoreTitle')}
        subtitle={t('backup.restoreSubtitle')}
        onPress={() => void onRestore()}
        testID="settings-restore-backup"
      />
      {isFolderSaveSupported && folderUri ? (
        <>
          <ListRow
            title={t('backup.changeFolderTitle')}
            onPress={() => void changeFolder()}
            testID="settings-change-backup-folder"
          />
          <ListRow
            title={t('backup.forgetFolderTitle')}
            onPress={forgetFolder}
            testID="settings-forget-backup-folder"
          />
        </>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary" testID="backup-last-backup">
        {lastBackupAt
          ? t('backup.lastBackup', { date: new Date(lastBackupAt).toLocaleString() })
          : t('backup.neverBackedUp')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('backup.vaultNote')}
      </ThemedText>
      {statusText ? (
        <ThemedText type="small" themeColor="textSecondary" testID="backup-status">
          {statusText}
        </ThemedText>
      ) : null}

      <BackupOptionsDialog
        visible={optionsVisible}
        busy={busy}
        folderSaveSupported={isFolderSaveSupported}
        hasFolder={folderUri !== null}
        onCancel={() => setOptionsVisible(false)}
        onConfirm={onConfirmOptions}
      />
      <RestorePassphraseDialog
        visible={pending !== null && pending.preview.hasVault}
        busy={busy}
        documents={pending?.preview.manifest.vault?.documents ?? 0}
        wrongPassphrase={wrongPassphrase}
        onCancel={() => {
          setPending(null);
          setWrongPassphrase(false);
        }}
        onSkipVault={() => {
          if (pending) void runRestore(pending, null);
        }}
        onSubmit={(passphrase) => {
          if (pending) void runRestore(pending, passphrase);
        }}
      />
    </Card>
  );
}
