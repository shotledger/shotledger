// Session-level actions, moved off the header into an overflow menu (§4
// fix batch, 2026-09-09) — the header row had run out of room for Sights,
// Edit, Share and Delete side by side.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { ActionSheet, type ActionSheetAction } from '@/components/action-sheet';
import { OverflowIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { db } from '@/db/client';
// Not softDeleteSession: deleting a session must also drop its series and back
// the fired rounds out of the firearm's counter, which feeds the FAP 551-3
// activity log. Same entry point Home's swipe-to-delete uses.
import { deleteSessionAndSeries } from '@/db/queries/round-count';

export interface SessionMenuProps {
  sessionId: string;
  firearmId: string | null;
  onDeleted?: () => void;
}

export function SessionMenu({ sessionId, firearmId, onDeleted }: SessionMenuProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  function onDelete() {
    Alert.alert(t('common.deleteSessionConfirmTitle'), t('common.deleteSessionConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.deleteSession'),
        style: 'destructive',
        onPress: () => {
          if (!db) return;
          deleteSessionAndSeries(db, sessionId);
          onDeleted?.();
          router.replace('/');
        },
      },
    ]);
  }

  const actions: ActionSheetAction[] = [
    {
      key: 'sights',
      label: t('session.menuSights'),
      disabled: firearmId === null,
      onPress: () => router.push(`/firearms/${firearmId}`),
    },
    {
      key: 'edit',
      label: t('session.menuEdit'),
      onPress: () => router.push(`/session/${sessionId}/edit`),
    },
    {
      key: 'share',
      label: t('session.menuShare'),
      onPress: () => router.push(`/session/${sessionId}/share`),
    },
    {
      key: 'delete',
      label: t('common.deleteSession'),
      destructive: true,
      onPress: onDelete,
    },
  ];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('session.menuLabel')}
        testID="session-menu"
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
