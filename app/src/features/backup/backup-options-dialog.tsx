// "Back Up" dialog: what goes into the bundle, and where it goes. Settings
// keeps only two rows (Back Up / Restore); every choice lives here.
//
// The Vault switch is the reason this dialog exists rather than a plain
// action. Turning it on puts photographs of weapon licence cards, membership
// cards and door codes into a file that leaves the device, so it is off by
// default, the warning is on screen rather than in help text, and the user
// has to both acknowledge it and set a passphrase before the export button
// does anything.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';
import { VAULT_PASSPHRASE_MIN_LENGTH } from '@shotledger/shared';

import {
  DEFAULT_EXPORT_OPTIONS,
  type BackupDestination,
  type BackupExportOptions,
} from './use-backup-export-import';

export interface BackupOptionsDialogProps {
  visible: boolean;
  busy: boolean;
  /** Whether saving straight into a folder is possible on this platform. */
  folderSaveSupported: boolean;
  /** A folder is already remembered, so "Folder" needs no picker first. */
  hasFolder: boolean;
  onCancel: () => void;
  onConfirm: (options: BackupExportOptions) => void;
}

export function BackupOptionsDialog({
  visible,
  busy,
  folderSaveSupported,
  hasFolder,
  onCancel,
  onConfirm,
}: BackupOptionsDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [includePhotos, setIncludePhotos] = useState(DEFAULT_EXPORT_OPTIONS.includePhotos);
  const [includeVault, setIncludeVault] = useState(DEFAULT_EXPORT_OPTIONS.includeVault);
  const [acknowledged, setAcknowledged] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [repeated, setRepeated] = useState('');
  const [destination, setDestination] = useState<BackupDestination>('share');

  function reset() {
    setIncludePhotos(DEFAULT_EXPORT_OPTIONS.includePhotos);
    setIncludeVault(false);
    setAcknowledged(false);
    setPassphrase('');
    setRepeated('');
    setDestination('share');
  }

  function onToggleVault(next: boolean) {
    setIncludeVault(next);
    if (!next) {
      // Never leave an acknowledgement or a passphrase armed behind a switch
      // the user has turned back off.
      setAcknowledged(false);
      setPassphrase('');
      setRepeated('');
    }
  }

  const tooShort = passphrase.length > 0 && passphrase.trim().length < VAULT_PASSPHRASE_MIN_LENGTH;
  const mismatch = repeated.length > 0 && passphrase !== repeated;
  const vaultReady =
    acknowledged &&
    passphrase.trim().length >= VAULT_PASSPHRASE_MIN_LENGTH &&
    passphrase === repeated;
  const canExport = !busy && (!includeVault || vaultReady);

  function confirm() {
    onConfirm({ includePhotos, includeVault, passphrase, destination });
    reset();
  }

  function cancel() {
    reset();
    onCancel();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={cancel}
      testID="backup-options-dialog"
    >
      <View style={styles.backdrop}>
        <ThemedView type="background" style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText type="subtitle">{t('backup.dialogTitle')}</ThemedText>

            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('backup.dialogContentsHeading')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('backup.dialogAlwaysIncluded')}
            </ThemedText>

            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <ThemedText type="default">{t('backup.includePhotosTitle')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('backup.includePhotosSubtitle')}
                </ThemedText>
              </View>
              <Switch
                value={includePhotos}
                onValueChange={setIncludePhotos}
                testID="backup-include-photos"
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <ThemedText type="default">{t('backup.includeVaultTitle')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('backup.includeVaultSubtitle')}
                </ThemedText>
              </View>
              <Switch
                value={includeVault}
                onValueChange={onToggleVault}
                testID="backup-include-vault"
              />
            </View>

            {includeVault ? (
              <View
                style={[styles.warning, { borderColor: theme.danger }]}
                testID="backup-vault-warning"
              >
                <ThemedText type="smallBold" themeColor="danger">
                  {t('backup.vaultWarningTitle')}
                </ThemedText>
                <ThemedText type="small">{t('backup.vaultWarningBody')}</ThemedText>
                <ThemedText type="small">{t('backup.vaultWarningPassphrase')}</ThemedText>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acknowledged }}
                  onPress={() => setAcknowledged(!acknowledged)}
                  style={styles.ackRow}
                  testID="backup-vault-acknowledge"
                >
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: theme.border },
                      acknowledged && {
                        backgroundColor: theme.primary,
                        borderColor: theme.primary,
                      },
                    ]}
                  />
                  <ThemedText type="small" style={styles.ackLabel}>
                    {t('backup.vaultAcknowledge')}
                  </ThemedText>
                </Pressable>

                <TextField
                  value={passphrase}
                  onChangeText={setPassphrase}
                  editable={acknowledged}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('backup.vaultPassphrasePlaceholder')}
                  testID="backup-vault-passphrase"
                />
                <TextField
                  value={repeated}
                  onChangeText={setRepeated}
                  editable={acknowledged}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('backup.vaultPassphraseRepeatPlaceholder')}
                  testID="backup-vault-passphrase-repeat"
                />
                {tooShort ? (
                  <ThemedText type="small" themeColor="danger">
                    {t('backup.vaultPassphraseTooShort', { count: VAULT_PASSPHRASE_MIN_LENGTH })}
                  </ThemedText>
                ) : null}
                {mismatch ? (
                  <ThemedText type="small" themeColor="danger">
                    {t('backup.vaultPassphraseMismatch')}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('backup.dialogDestinationHeading')}
            </ThemedText>
            <View style={styles.pillRow}>
              {(['share', 'folder'] as const).map((option) => {
                const selected = destination === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setDestination(option)}
                    testID={`backup-destination-${option}`}
                    style={[
                      styles.pill,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                      selected && {
                        borderColor: theme.primary,
                        backgroundColor: theme.backgroundSelected,
                      },
                    ]}
                  >
                    <ThemedText type="small">
                      {option === 'share'
                        ? t('backup.destinationShare')
                        : t('backup.destinationFolder')}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {destination === 'share'
                ? t('backup.destinationShareNote')
                : !folderSaveSupported
                  ? t('backup.folderSaveIosFallbackSubtitle')
                  : hasFolder
                    ? t('backup.folderChosenSubtitle')
                    : t('backup.saveToFolderSubtitle')}
            </ThemedText>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={cancel}
                style={styles.cancel}
                testID="backup-dialog-cancel"
              >
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t('common.cancel')}
                </ThemedText>
              </Pressable>
              <View style={[styles.confirm, !canExport && styles.disabled]}>
                <PrimaryButton
                  label={busy ? t('backup.dialogWorking') : t('backup.dialogConfirm')}
                  disabled={!canExport}
                  onPress={confirm}
                  testID="backup-dialog-confirm"
                />
              </View>
            </View>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    maxHeight: '90%',
  },
  sheetContent: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  switchText: {
    flex: 1,
    gap: Spacing.half,
  },
  warning: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ackLabel: {
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: Radius.small,
  },
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  cancel: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  confirm: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
