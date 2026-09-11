// Overflow menu for the Shot Timer's setup view. Shot-detection diagnostics
// used to sit in Tools, a screen away from the timer whose detection it
// measures; it belongs beside the setting it exists to inform (maintainer,
// 2026-09-11).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { ActionSheet, type ActionSheetAction } from '@/components/action-sheet';
import { OverflowIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';

export function TimerMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const actions: ActionSheetAction[] = [
    {
      key: 'diagnostics',
      label: t('ipscTimer.menuDiagnostics'),
      onPress: () => router.push('/shot-diagnostics'),
    },
  ];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('ipscTimer.menuLabel')}
        testID="timer-menu"
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <OverflowIcon color={theme.primary} />
      </Pressable>
      <ActionSheet visible={open} onClose={() => setOpen(false)} actions={actions} />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    // Material's 48dp touch-target floor, not a spacing value.
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
