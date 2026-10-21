// One external site's features (ARCHITECTURE.md § External sites). Reached from Tools, which shows
// a single row per enabled site; everything that site can do lives here
// rather than on the Tools screen itself.
//
// The rows come from the provider's declared capabilities, so "functionality
// will of course differ depending on the external site" needs no code here
// when the second provider lands.
import { findProvider } from '@shotledger/shared/src/integrations/providers/registry';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { routedCapabilities } from '@/features/providers/capability-routes';
import { useWebshooterConnection } from '@/features/webshooter/use-webshooter-connection';

export default function ExternalSiteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const provider = findProvider(id ?? '');
  const connection = useWebshooterConnection();

  if (!provider) {
    // A route param from a build that had a provider this one does not.
    return (
      <Screen>
        <Stack.Screen options={{ title: t('providers.unknownTitle') }} />
        <EmptyState title={t('providers.unknownTitle')} body={t('providers.unknownBody')} />
      </Screen>
    );
  }

  const capabilities = routedCapabilities(provider);

  return (
    <Screen>
      <Stack.Screen options={{ title: provider.displayName }} />
      {/* The site's own name, in the body: every other screen states what
          it is rather than relying on the nav bar alone. */}
      <ScreenTitle>{provider.displayName}</ScreenTitle>

      {/* The one screen where two halves of ARCHITECTURE.md § External sites have to meet: the site is
          enabled here, but signing in happens in Settings. Saying "not
          connected" without a way there left the user to know, unaided, that
          the fix lives in another tab. */}
      {!connection.connected && (
        <Card>
          <ThemedText type="small" themeColor="textSecondary" testID="provider-not-connected">
            {t('providers.notConnected', { site: provider.displayName })}
          </ThemedText>
          <DrillDownRow
            title={t('providers.connectTitle')}
            subtitle={t('providers.connectSubtitle')}
            onPress={() => router.push('/settings/external-sites')}
            testID="provider-connect-link"
          />
        </Card>
      )}

      <Card>
        {capabilities.map(({ capability, route }) => (
          <DrillDownRow
            key={capability}
            title={t(`providers.capability.${capability}.title` as const)}
            subtitle={t(`providers.capability.${capability}.subtitle` as const)}
            onPress={() => router.push(route as never)}
            testID={`provider-capability-${capability}`}
          />
        ))}
      </Card>
    </Screen>
  );
}
