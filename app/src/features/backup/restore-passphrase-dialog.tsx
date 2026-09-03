// Passphrase prompt for restoring a bundle that carries a Vault section.
// `Alert.prompt` is iOS-only, so this is a plain modal (hard rule 6).
//
// "Restore Without Vault" is a first-class action, not a cancel: a user who
// has lost the passphrase must still be able to get their logbook back.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface RestorePassphraseDialogProps {
  visible: boolean;
  busy: boolean;
  documents: number;
  /** Set after a failed attempt, so the message says what went wrong. */
  wrongPassphrase: boolean;
  onCancel: () => void;
  onSkipVault: () => void;
  onSubmit: (passphrase: string) => void;
}

export function RestorePassphraseDialog({
  visible,
  busy,
  documents,
  wrongPassphrase,
  onCancel,
  onSkipVault,
  onSubmit,
}: RestorePassphraseDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [passphrase, setPassphrase] = useState('');

  function submit() {
    onSubmit(passphrase);
    setPassphrase('');
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
      testID="restore-passphrase-dialog"
    >
      <View style={styles.backdrop}>
        <ThemedView type="background" style={styles.sheet}>
          <ThemedText type="subtitle">{t('backup.restoreVaultPromptTitle')}</ThemedText>
          <ThemedText type="small">
            {t('backup.restoreVaultPromptBody', { count: documents })}
          </ThemedText>
          {wrongPassphrase ? (
            <ThemedText type="small" themeColor="danger" testID="restore-passphrase-error">
              {t('backup.restoreVaultWrongPassphrase')}
            </ThemedText>
          ) : null}
          <TextInput
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('backup.vaultPassphrasePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            testID="restore-vault-passphrase"
          />
          <PrimaryButton
            label={busy ? t('backup.dialogWorking') : t('backup.restoreVaultPromptConfirm')}
            disabled={busy || passphrase.trim().length === 0}
            onPress={submit}
            testID="restore-passphrase-submit"
          />
          <Pressable
            accessibilityRole="button"
            onPress={onSkipVault}
            style={styles.secondary}
            testID="restore-skip-vault"
          >
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('backup.restoreVaultPromptSkip')}
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.secondary}
            testID="restore-passphrase-cancel"
          >
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('common.cancel')}
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  secondary: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
