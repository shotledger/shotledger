// Settings → Optional Fields (#569). A switch per input a shooter may never
// use. Off hides the input only; see features/settings/tracked-inputs.ts.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { readTrackedInputs, type TrackedInputs } from '@/features/settings/tracked-inputs';
import { Spacing } from '@/theme/tokens';

const ROWS = [
  { field: 'handloads', key: SETTINGS_KEYS.trackHandloads, label: 'trackHandloads' },
  { field: 'weaponGroups', key: SETTINGS_KEYS.trackWeaponGroups, label: 'trackWeaponGroups' },
  { field: 'shooterClass', key: SETTINGS_KEYS.trackShooterClass, label: 'trackShooterClass' },
] as const;

export default function TrackingSettingsScreen() {
  const { t } = useTranslation();
  const [tracked, setTracked] = useState<TrackedInputs>(() => readTrackedInputs(db));

  function onToggle(row: (typeof ROWS)[number], next: boolean) {
    setTracked((current) => ({ ...current, [row.field]: next }));
    if (db) setSetting<boolean>(db, row.key, next);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.trackingTitle') }} />
      <ScreenTitle>{t('settings.trackingTitle')}</ScreenTitle>
      <ThemedText type="small" themeColor="textSecondary">
        {t('settings.trackingIntro')}
      </ThemedText>

      {ROWS.map((row) => (
        <Card key={row.field}>
          <View style={styles.switchRow}>
            <ThemedText type="smallBold" style={styles.label}>
              {t(`settings.${row.label}`)}
            </ThemedText>
            <Switch
              value={tracked[row.field]}
              onValueChange={(next) => onToggle(row, next)}
              testID={`tracking-${row.field}`}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t(`settings.${row.label}Hint`)}
          </ThemedText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  label: {
    flexShrink: 1,
  },
});
