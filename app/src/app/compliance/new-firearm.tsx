// License Check › New Firearm: the activity rule for the shooter's case and
// the additional-handgun box for each handgun they hold.
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { licenseActivityKey } from '@/features/compliance/activity-key';
import { CriterionBlock, Muted, RuleBlock } from '@/features/compliance/license-check-blocks';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useLicenseCheck } from '@/features/compliance/use-license-check';

export default function NewFirearmCheckScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useComplianceProfile();
  const check = useLicenseCheck(profile);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('compliance.check.newFirearm') }} />
      <ScreenTitle>{t('compliance.check.newFirearm')}</ScreenTitle>
      {!profile || !check ? (
        <Card>
          <Muted testID="check-off">{t('compliance.check.off')}</Muted>
          <DrillDownRow
            title={t('compliance.settingsTitle')}
            onPress={() => router.push('/settings/compliance')}
            testID="check-open-settings"
          />
        </Card>
      ) : (
        <>
          <Card>
            <Muted>{t('compliance.check.purchaseHint')}</Muted>
            {check.rules.map((rule) => (
              <RuleBlock key={licenseActivityKey(rule.activity)} check={rule} />
            ))}
            <Muted>{t(`compliance.licenseActivityCase.${profile.variantId}`)}</Muted>
          </Card>
          <Card>
            {check.purchase.length === 0 ? (
              <Muted testID="check-no-held-handgun">{t('compliance.check.noHeldHandgun')}</Muted>
            ) : (
              check.purchase.map((item) => (
                <CriterionBlock
                  key={`${item.criterion.criterionId}-${item.firearmId}`}
                  check={item}
                />
              ))
            )}
          </Card>
          <Muted>{t('compliance.criterionNotAttested')}</Muted>
        </>
      )}
    </Screen>
  );
}
