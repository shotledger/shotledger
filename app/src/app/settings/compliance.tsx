// Settings → Compliance. Which license-activity profile the activity status and the
// föreningsintyg PDF are worked out under, and which case within it applies to
// this shooter (for `se`: FAP 551-3 5 § vs 6 §). The app proposes a case from
// the firearms; picking one here overrides that for good (issue #286).
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
  const {
    selection,
    profile,
    setSelection,
    variantIds,
    variantId,
    isVariantExplicit,
    setVariantId,
  } = useComplianceProfile();

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

      {/* Only profiles that actually offer a choice get a picker. */}
      {profile && variantId && variantIds.length > 1 && (
        <Card>
          <ThemedText type="smallBold">{t('compliance.caseTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('compliance.caseBody')}
          </ThemedText>
          <SegmentedControl
            options={variantIds.map((id) => ({ value: id, label: t(`compliance.case.${id}`) }))}
            value={variantId}
            onChange={setVariantId}
            testID="compliance-case-picker"
          />
          <ThemedText type="small" themeColor="textSecondary" testID="compliance-case-hint">
            {t(`compliance.caseHint.${variantId}`)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" testID="compliance-case-origin">
            {t(isVariantExplicit ? 'compliance.caseExplicit' : 'compliance.caseDerived')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('compliance.notModeled')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" testID="compliance-source">
            {t('compliance.sourceCitation')}
          </ThemedText>
        </Card>
      )}
    </Screen>
  );
}
