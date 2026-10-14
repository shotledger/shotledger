// License Check (#804), top-down: can I apply for a new firearm, and can each
// firearm's license be renewed. Each row opens its own detail with the
// requirements behind the answer. Opened from the status on Home.
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import {
  firearmSummaries,
  newFirearmSummary,
  type FirearmSummary,
} from '@/features/compliance/license-check';
import { Muted } from '@/features/compliance/license-check-blocks';
import { nextSessionDeadline } from '@/features/compliance/next-session';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useLicenseCheck } from '@/features/compliance/use-license-check';
import { useDateFormat } from '@/features/dates/use-date-format';

function useRenewalLine() {
  const { t } = useTranslation();
  const dates = useDateFormat();
  return ({ renewal }: FirearmSummary): { value: string; subtitle: string } => {
    if (!renewal) {
      return { value: t('compliance.check.notNeeded'), subtitle: t('compliance.check.noEndDate') };
    }
    if (renewal.criterion.met) {
      return {
        value: t('compliance.check.yes'),
        subtitle: renewal.lapseIso
          ? t('compliance.check.yesThrough', {
              date: dates.date(nextSessionDeadline(renewal.lapseIso)),
            })
          : '',
      };
    }
    const { shortfall } = renewal;
    return {
      value: t('compliance.check.no'),
      subtitle:
        shortfall.olderPeriods.length > 0 && shortfall.metFromIso
          ? t('compliance.check.canBeMetFrom', { date: dates.date(shortfall.metFromIso) })
          : t('compliance.check.criterionNeeded', { count: shortfall.recentNeeded }),
    };
  };
}

export default function LicenseCheckScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dates = useDateFormat();
  const { profile } = useComplianceProfile();
  const check = useLicenseCheck(profile);
  const renewalLine = useRenewalLine();

  if (!profile || !check) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('compliance.check.title') }} />
        <ScreenTitle>{t('compliance.check.title')}</ScreenTitle>
        <Card>
          <Muted testID="check-off">{t('compliance.check.off')}</Muted>
          <DrillDownRow
            title={t('compliance.settingsTitle')}
            onPress={() => router.push('/settings/compliance')}
            testID="check-open-settings"
          />
        </Card>
      </Screen>
    );
  }

  const purchase = newFirearmSummary(check);
  const firearms = firearmSummaries(check);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('compliance.check.title') }} />
      <ScreenTitle>{t('compliance.check.title')}</ScreenTitle>

      <Card>
        <ThemedText type="smallBold">{t('compliance.check.purchaseTitle')}</ThemedText>
        <Muted>{t('compliance.check.purchaseQuestion')}</Muted>
        <DrillDownRow
          title={t('compliance.check.newFirearm')}
          subtitle={
            purchase.ready
              ? purchase.lapseIso
                ? t('compliance.check.yesThrough', {
                    date: dates.date(nextSessionDeadline(purchase.lapseIso)),
                  })
                : undefined
              : t('compliance.check.unmet', { count: purchase.unmet })
          }
          value={t(purchase.ready ? 'compliance.check.yes' : 'compliance.check.no')}
          onPress={() => router.push('/compliance/new-firearm')}
          testID="check-new-firearm"
        />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('compliance.check.renewalTitle')}</ThemedText>
        <Muted>{t('compliance.check.renewalQuestion')}</Muted>
        {firearms.length === 0 ? (
          <Muted testID="check-no-firearms">{t('compliance.check.noFirearms')}</Muted>
        ) : (
          firearms.map((firearm) => {
            const line = renewalLine(firearm);
            return (
              <DrillDownRow
                key={firearm.id}
                title={firearm.name}
                subtitle={line.subtitle || undefined}
                value={line.value}
                onPress={() => router.push(`/compliance/firearm/${firearm.id}`)}
                testID={`check-renew-${firearm.id}`}
              />
            );
          })
        )}
      </Card>

      <Muted>{t('compliance.criterionNotAttested')}</Muted>
    </Screen>
  );
}
