// Settings → External Sites (ADR 0010): enabling a site is a preference and
// connecting to it is a credential, so both live here rather than in Tools,
// which is for using them.
import { PROVIDERS } from '@shotledger/shared/src/integrations/providers/registry';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { ProviderSettingsRow } from '@/features/providers/provider-settings-row';

export default function ExternalSitesSettingsScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <Stack.Screen options={{ title: t('providers.sectionTitle') }} />
      <ScreenTitle>{t('providers.sectionTitle')}</ScreenTitle>

      <ThemedText type="small" themeColor="textSecondary">
        {t('providers.settingsHint')}
      </ThemedText>

      {/* One card per site. Sharing a card made two sites read as one
          settings block with two switches in it, and a connected site's
          credentials and calendar row ran straight into the next site's
          name (maintainer, 2026-09-11). */}
      {PROVIDERS.map((provider) => (
        <Card key={provider.id}>
          <ProviderSettingsRow provider={provider} />
        </Card>
      ))}
    </Screen>
  );
}
