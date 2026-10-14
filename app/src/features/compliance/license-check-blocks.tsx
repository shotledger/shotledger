// The pieces of License Check (#804) the overview's two detail screens share:
// one activity rule, one föreningsintyg box for one firearm, and the muted
// line they are written in.
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { DrillDownRow } from '@/components/drill-down-row';
import { ThemedText } from '@/components/themed-text';
import { useDateFormat } from '@/features/dates/use-date-format';
import { Spacing } from '@/theme/tokens';

import { licenseActivityKey } from './activity-key';
import type { CriterionCheck, RuleCheck } from './license-check';
import { nextSessionDeadline } from './next-session';

const TONE: Record<string, 'neutral' | 'primary'> = {
  green: 'neutral',
  amber: 'primary',
  red: 'primary',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function Muted({ children, testID }: { children: string; testID?: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" testID={testID}>
      {children}
    </ThemedText>
  );
}

export function RuleBlock({ check }: { check: RuleCheck }) {
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

/** One box for one firearm; `showFirearm` adds a row that opens the firearm. */
export function CriterionBlock({
  check,
  showFirearm = true,
}: {
  check: CriterionCheck;
  showFirearm?: boolean;
}) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const { criterion, shortfall } = check;
  const id = `${criterion.criterionId}-${check.firearmId}`;
  return (
    <View style={styles.block}>
      {showFirearm && (
        <DrillDownRow
          title={check.firearmName}
          onPress={() => router.push(`/firearms/${check.firearmId}`)}
          testID={`check-firearm-${id}`}
        />
      )}
      <Chip
        testID={`check-criterion-${id}`}
        label={t(criterion.met ? 'compliance.criterionMet' : 'compliance.criterionNotMet', {
          name: t(`compliance.criterion.${criterion.criterionId}`),
        })}
        tone={TONE[criterion.status]}
      />
      {criterion.periods.map((period) => (
        <View key={period.startIso} style={styles.period}>
          <Muted>
            {t('compliance.criterionPeriod', {
              done: period.activityCount,
              required: criterion.requiredActivities,
              from: dates.date(period.startIso),
              to: dates.date(period.endIso),
            })}
          </Muted>
          {shortfall.olderPeriods.some((older) => older.startIso === period.startIso) && (
            <Muted testID={`check-criterion-older-${id}`}>{t('compliance.check.olderShort')}</Muted>
          )}
        </View>
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
      {shortfall.olderPeriods.length > 0 && shortfall.metFromIso && (
        <Muted testID={`check-criterion-met-from-${id}`}>
          {t('compliance.check.metFrom', { date: dates.date(shortfall.metFromIso) })}
        </Muted>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.half,
    marginTop: Spacing.two,
  },
  period: {
    gap: Spacing.half,
  },
});
