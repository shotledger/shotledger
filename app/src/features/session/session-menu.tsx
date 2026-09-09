// Session-level actions, moved off the header into an overflow menu (§4 fix
// batch, 2026-09-09) — the header row had run out of room. Session view only:
// the shot-entry screen carries none of this, since nothing here is done
// while entering shots.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { resolveActiveSightSetting } from '@shotledger/shared';

import { ActionSheet, type ActionSheetAction } from '@/components/action-sheet';
import { OverflowIcon } from '@/components/icons';
import { db } from '@/db/client';
// Not softDeleteSession: deleting a session must also drop its series and back
// the fired rounds out of the firearm's counter, which feeds the FAP 551-3
// activity log. Same entry point Home's swipe-to-delete uses.
import { deleteSessionAndSeries } from '@/db/queries/round-count';
import { listSightSettings, setActiveSightSetting } from '@/db/queries/sight-settings';
import { sightSettingLabel } from '@/features/firearms/sight-turns-text';
import { useTheme } from '@/hooks/use-theme';

export interface SessionMenuProps {
  sessionId: string;
  /** Firearm whose sight settings this menu can switch; null when the
   *  session has no firearm linked, which drops the Sights row. */
  sightsFirearmId: string | null;
  onDeleted?: () => void;
}

type OpenSheet = 'none' | 'main' | 'sights';

export function SessionMenu({ sessionId, sightsFirearmId, onDeleted }: SessionMenuProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [sheet, setSheet] = useState<OpenSheet>('none');
  const [sightSettings, setSightSettings] = useState<ReturnType<typeof listSightSettings>>([]);

  function loadSights() {
    if (!db || !sightsFirearmId) return [];
    const rows = listSightSettings(db, sightsFirearmId);
    setSightSettings(rows);
    return rows;
  }

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
    ...(sightSettings.length > 0
      ? [
          {
            key: 'sights',
            label: t('session.menuSights'),
            onPress: () => setSheet('sights'),
          },
        ]
      : []),
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

  const current = resolveActiveSightSetting(sightSettings);
  const sightActions: ActionSheetAction[] = sightSettings.map((setting) => ({
    key: setting.id,
    label: sightSettingLabel(t, current, setting),
    selected: setting.id === current?.id,
    onPress: () => {
      if (!db || !sightsFirearmId) return;
      setActiveSightSetting(db, sightsFirearmId, setting.id);
      loadSights();
    },
  }));

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('session.menuLabel')}
        testID="session-menu"
        onPress={() => {
          loadSights();
          setSheet('main');
        }}
        style={styles.trigger}
      >
        <OverflowIcon color={theme.primary} />
      </Pressable>
      <ActionSheet visible={sheet === 'main'} onClose={() => setSheet('none')} actions={actions} />
      <ActionSheet
        visible={sheet === 'sights'}
        onClose={() => setSheet('none')}
        title={t('session.sightsTitle')}
        actions={sightActions}
      />
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
