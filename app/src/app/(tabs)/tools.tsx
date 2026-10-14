// Tools tab — the utilities that are not app settings: timers, photos and
// the external sites the shooter has enabled.
//
// External sites are one row each, and only when enabled (ADR 0010).
// Connecting to them is back in Settings: the login form had turned a
// third of this screen into a sign-in page for a site most sessions never
// touch.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme/tokens';

import { PROVIDERS } from '@shotledger/shared/src/integrations/providers/registry';
import { isProviderEnabled } from '@/features/providers/use-provider-enabled';

export default function ToolsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // Re-read on focus, not once per mount: the tab stays mounted while the
  // shooter turns a site on over in Settings, so a plain render-time read
  // showed the site only after an app restart.
  const [enabledProviders, setEnabledProviders] = useState(() =>
    PROVIDERS.filter((provider) => isProviderEnabled(provider.id)),
  );
  useFocusEffect(
    useCallback(() => {
      setEnabledProviders(PROVIDERS.filter((provider) => isProviderEnabled(provider.id)));
    }, []),
  );
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

      {/* Only once a site is actually enabled. A heading over "none enabled"
          is a card that can never be acted on, and Tools is for using things
          — Settings → External Sites is where one gets turned on, and says so
          there. */}
      {/* A plain heading, like Home's "Latest Sessions". Inside a card of its
          own it read as one more row to tap (maintainer, 2026-10-13). */}
      {enabledProviders.length > 0 && (
        <ThemedText type="smallBold" accessibilityRole="header" style={styles.sectionHeading}>
          {t('providers.sectionTitle')}
        </ThemedText>
      )}

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Closer to the cards it heads than to the one above it, so it groups with them.
  sectionHeading: {
    marginTop: Spacing.three,
  },
});
