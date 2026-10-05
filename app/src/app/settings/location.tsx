// Settings → Location. The opt-in online place lookup for a session's
// Location field. Off by default: when on, what the user types there is sent
// to photon.komoot.io.
//
// A drill-down like every other settings group (#138), but the warning about
// what leaves the phone stays on the page with the switch — that is the part
// that changes what you are about to do.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { InfoButton } from '@/components/info-button';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { Spacing } from '@/theme/tokens';

export default function LocationSettingsScreen() {
  const { t } = useTranslation();

  const [onlineLocationLookup, setOnlineLocationLookup] = useState(() =>
    getSetting<boolean>(db, SETTINGS_KEYS.onlineLocationLookup, false),
  );

  function onToggle(next: boolean) {
    setOnlineLocationLookup(next);
    setSetting<boolean>(db, SETTINGS_KEYS.onlineLocationLookup, next);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.locationLookup') }} />
      <ScreenTitle>{t('settings.locationLookup')}</ScreenTitle>

      <Card>
        <View style={styles.headerRow}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('settings.locationLookup')}
          </ThemedText>
          <InfoButton
            title={t('settings.locationLookup')}
            body={t('settings.locationLookupInfo')}
            testID="location-lookup-info"
          />
        </View>
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('settings.locationLookupOnline')}</ThemedText>
          <Switch
            value={onlineLocationLookup}
            onValueChange={onToggle}
            testID="online-location-lookup"
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.locationLookupHelp')}
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerLabel: {
    flexShrink: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
