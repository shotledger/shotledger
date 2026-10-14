// License Check (#804): every requirement on the föreningsintyg, grouped by
// what the intyg is for, with whether it is met and what to do about it.
// Opened from the status on Home.
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DrillDownRow } from '@/components/drill-down-row';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { licenseActivityKey } from '@/features/compliance/activity-key';
import { nextSessionDeadline } from '@/features/compliance/next-session';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import {
  useLicenseCheck,
  type CriterionCheck,
  type RuleCheck,
} from '@/features/compliance/use-license-check';
import { useDateFormat } from '@/features/dates/use-date-format';
import { Spacing } from '@/theme/tokens';

const TONE: Record<string, 'neutral' | 'primary'> = {
  green: 'neutral',
  amber: 'primary',
  red: 'primary',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Muted({ children, testID }: { children: string; testID?: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" testID={testID}>
      {children}
    </ThemedText>
  );
}

function RuleBlock({ check }: { check: RuleCheck }) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const { activity } = check;
  const key = licenseActivityKey(activity);
  return (
    <View style={styles.block}>
      <Chip
        testID={`check-rule-${key}`}
        label={t(`compliance.licenseActivity${capitalize(activity.status)}`)}
        tone={TONE[activity.status]}
      />
      <Muted>
        {t('compliance.licenseActivityDetail', {
          done: activity.activityCount,
          required: activity.requiredActivities,
          months: activity.windowMonths,
        })}
      </Muted>
      {check.lapseIso ? (
        <Muted testID={`check-rule-next-${key}`}>
          {t('compliance.nextSessionBy', {
            date: dates.date(nextSessionDeadline(check.lapseIso)),
          })}
        </Muted>
      ) : (
        <Muted testID={`check-rule-needed-${key}`}>
          {t('compliance.check.ruleNeeded', { count: check.needed })}
        </Muted>
      )}
    </View>
  );
}

function CriterionBlock({ check }: { check: CriterionCheck }) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const { criterion, shortfall } = check;
  const id = `${criterion.criterionId}-${check.firearmId}`;
  return (
    <View style={styles.block}>
      <DrillDownRow
        title={check.firearmName}
        onPress={() => router.push(`/firearms/${check.firearmId}`)}
        testID={`check-firearm-${id}`}
      />
      <Chip
        testID={`check-criterion-${id}`}
        label={t(criterion.met ? 'compliance.criterionMet' : 'compliance.criterionNotMet', {
          name: t(`compliance.criterion.${criterion.criterionId}`),
        })}
        tone={TONE[criterion.status]}
      />
      {criterion.periods.map((period) => (
        <Muted key={period.startIso}>
          {t('compliance.criterionPeriod', {
            done: period.activityCount,
            required: criterion.requiredActivities,
            from: dates.date(period.startIso),
            to: dates.date(period.endIso),
          })}
        </Muted>
      ))}
      {check.lapseIso && (
        <Muted testID={`check-criterion-next-${id}`}>
          {t('compliance.criterionNextSessionBy', {
            date: dates.date(nextSessionDeadline(check.lapseIso)),
          })}
        </Muted>
      )}
      {shortfall.recentNeeded > 0 && (
        <Muted testID={`check-criterion-needed-${id}`}>
          {t('compliance.check.criterionNeeded', { count: shortfall.recentNeeded })}
        </Muted>
      )}
      {shortfall.olderPeriods.map((period) => (
        <Muted key={`older-${period.startIso}`} testID={`check-criterion-older-${id}`}>
          {t('compliance.check.olderShort', {
            from: dates.date(period.startIso),
            to: dates.date(period.endIso),
            done: period.activityCount,
            required: criterion.requiredActivities,
          })}
        </Muted>
      ))}
      {shortfall.olderPeriods.length > 0 && shortfall.metFromIso && (
        <Muted testID={`check-criterion-met-from-${id}`}>
          {t('compliance.check.metFrom', { date: dates.date(shortfall.metFromIso) })}
        </Muted>
      )}
    </View>
  );
}

export default function LicenseCheckScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useComplianceProfile();
  const check = useLicenseCheck(profile);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('compliance.check.title') }} />
      <ScreenTitle>{t('compliance.check.title')}</ScreenTitle>

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
            <ThemedText type="smallBold">{t('compliance.check.purchaseTitle')}</ThemedText>
            <Muted>{t('compliance.check.purchaseHint')}</Muted>
            {check.rules.map((rule) => (
              <RuleBlock key={licenseActivityKey(rule.activity)} check={rule} />
            ))}
            <Muted>{t(`compliance.licenseActivityCase.${profile.variantId}`)}</Muted>
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

          <Card>
            <ThemedText type="smallBold">{t('compliance.check.renewalTitle')}</ThemedText>
            <Muted>{t('compliance.check.renewalHint')}</Muted>
            {check.renewal.length === 0 ? (
              <Muted testID="check-no-time-limited">{t('compliance.check.noTimeLimited')}</Muted>
            ) : (
              check.renewal.map((item) => (
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

const styles = StyleSheet.create({
  block: {
    gap: Spacing.half,
    marginTop: Spacing.two,
  },
});
