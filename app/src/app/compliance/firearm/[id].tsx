// License Check › one firearm: its renewal box, and the additional-handgun box
// when it is a handgun of the shooter's own, with a row that opens the firearm.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { firearmSummaries } from '@/features/compliance/license-check';
import { CriterionBlock, Muted } from '@/features/compliance/license-check-blocks';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useLicenseCheck } from '@/features/compliance/use-license-check';

export default function FirearmCheckScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useComplianceProfile();
  const check = useLicenseCheck(profile);
  const firearm = check ? firearmSummaries(check).find((item) => item.id === id) : undefined;
  const title = firearm?.name ?? t('compliance.check.title');

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <ScreenTitle>{title}</ScreenTitle>
      {firearm && (
        <>
          <Card>
            <DrillDownRow
              title={t('compliance.check.openFirearm')}
              onPress={() => router.push(`/firearms/${firearm.id}`)}
              testID="check-open-firearm"
            />
          </Card>
          <Card>
            <ThemedText type="smallBold">{t('compliance.check.renewalTitle')}</ThemedText>
            <Muted>{t('compliance.check.renewalHint')}</Muted>
            {firearm.renewal ? (
              <CriterionBlock check={firearm.renewal} showFirearm={false} />
            ) : (
              <Muted testID="check-no-end-date">{t('compliance.check.noEndDate')}</Muted>
            )}
          </Card>
          {firearm.purchase && (
            <Card>
              <ThemedText type="smallBold">{t('compliance.check.purchaseTitle')}</ThemedText>
              <Muted>{t('compliance.check.purchaseHint')}</Muted>
              <CriterionBlock check={firearm.purchase} showFirearm={false} />
            </Card>
          )}
          <Muted>{t('compliance.criterionNotAttested')}</Muted>
        </>
      )}
    </Screen>
  );
}
