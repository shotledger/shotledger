// Settings → Compliance. Which licence-activity profile the barometer and the
// föreningsintyg PDF are worked out under.
import type { ProfileSelection } from '@shotledger/shared';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';

export default function ComplianceSettingsScreen() {
  const { t } = useTranslation();
  const { selection, profile, setSelection } = useComplianceProfile();

  return (
    <Screen>
      <Stack.Screen options={{ title: t('compliance.settingsTitle') }} />
      <ScreenTitle>{t('compliance.settingsTitle')}</ScreenTitle>

      <Card>
        <SegmentedControl
          options={[
            { value: 'none' as ProfileSelection, label: t('compliance.profileNone') },
            { value: 'se' as ProfileSelection, label: t('compliance.profileSe') },
          ]}
          value={selection}
          onChange={setSelection}
          testID="compliance-profile-picker"
        />
        {profile && !profile.verified && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('compliance.unverifiedHint')}
          </ThemedText>
        )}
      </Card>
    </Screen>
  );
}
