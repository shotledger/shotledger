// Tools tab — the utilities that are not app settings: timers, the
// encrypted vault, and the external sites the shooter has enabled.
//
// External sites are one row each, and only when enabled (ADR 0010).
// Connecting to them is back in Settings: the login form had turned a
// third of this screen into a sign-in page for a site most sessions never
// touch.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { PROVIDERS } from '@shotledger/shared/src/integrations/providers/registry';
import { isProviderEnabled } from '@/features/providers/use-provider-enabled';
import { Spacing } from '@/theme/tokens';

export default function ToolsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const enabledProviders = PROVIDERS.filter((provider) => isProviderEnabled(provider.id));
  const [devMockEnabled, setDevMockEnabled] = useState(() =>
    db ? getSetting<boolean>(db, 'webshooterDevMock', false) : false,
  );

  function onToggleDevMock(next: boolean) {
    setDevMockEnabled(next);
    if (db) setSetting<boolean>(db, 'webshooterDevMock', next);
  }

  return (
    <Screen>
      <ScreenTitle>{t('tools.title')}</ScreenTitle>

      <Card>
        <DrillDownRow
          title={t('timer.title')}
          subtitle={t('tools.timerSubtitle')}
          onPress={() => router.push('/timer')}
          testID="tools-open-timer"
        />
      </Card>

      <Card>
        <DrillDownRow
          title={t('photos.title')}
          subtitle={t('tools.photosSubtitle')}
          onPress={() => router.push('/photos')}
          testID="tools-open-photos"
        />
      </Card>

      <Card>
        {/* `vault.settingsRow*` keys keep their names so the vault rename
            landing in parallel does not conflict with this move. */}
        <DrillDownRow
          title={t('vault.settingsRowTitle')}
          subtitle={t('vault.settingsRowSubtitle')}
          onPress={() => router.push('/vault')}
          testID="tools-open-vault"
        />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('providers.sectionTitle')}</ThemedText>
        {enabledProviders.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary" testID="providers-empty">
            {t('providers.noneEnabled')}
          </ThemedText>
        )}
      </Card>

      {/* A card each, so two sites never blur into one list of rows. */}
      {enabledProviders.map((provider) => (
        <Card key={provider.id}>
          <DrillDownRow
            title={provider.displayName}
            subtitle={t('providers.rowSubtitle')}
            onPress={() => router.push(`/external/${provider.id}` as never)}
            testID={`providers-open-${provider.id}`}
          />
        </Card>
      ))}

      {__DEV__ && (
        <View style={styles.devSection}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('settings.devSection')}
          </ThemedText>
          <Card>
            <ListRow
              title={t('webshooter.devMockTitle')}
              subtitle={t('webshooter.devMockSubtitle')}
              trailing={
                <Switch
                  value={devMockEnabled}
                  onValueChange={onToggleDevMock}
                  testID="webshooter-dev-mock-toggle"
                />
              }
            />
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  devSection: {
    gap: Spacing.two,
  },
});
