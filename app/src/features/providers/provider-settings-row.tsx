// One external site in Settings: the switch that decides whether it exists
// for this shooter, and — once it does — the credentials for it.
//
// The connection form only appears when the site is enabled. Showing a
// login for a site nobody has asked for is how Tools ended up looking like
// a sign-in screen (ADR 0010).
import type { ProviderDescriptor } from '@shotledger/shared/src/integrations/providers/registry';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Toggle } from '@/components/toggle';
import { ProviderConnection } from '@/features/providers/provider-connection';
import { useProviderEnabled } from '@/features/providers/use-provider-enabled';
import { Spacing } from '@/theme/tokens';

export interface ProviderSettingsRowProps {
  provider: ProviderDescriptor;
}

export function ProviderSettingsRow({ provider }: ProviderSettingsRowProps) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useProviderEnabled(provider.id);

  return (
    <View style={styles.row}>
      <ListRow
        title={provider.displayName}
        subtitle={t('providers.enableSubtitle', { site: provider.displayName })}
        trailing={
          <Toggle
            value={enabled}
            onValueChange={setEnabled}
            testID={`provider-${provider.id}-enabled`}
          />
        }
      />
      {enabled && <ProviderConnection provider={provider} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
  },
});
