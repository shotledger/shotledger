// The session Stats view's "Vs. Your Usual Form" block (#798). Every number
// comes from @shotledger/shared's compareWithUsualForm; this file only lays
// it out. Deliberately plain: no colours that cheer or scold, no icons
// (PRODUCT.md principle 6).
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { tenthsToScore, type UsualFormComparison, type UsualFormVerdict } from '@shotledger/shared';

import { ThemedText } from '@/components/themed-text';
import { formatTotalScore } from '@/features/stats/format-total-score';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

import { signed, usualFormMarks } from './usual-form-scale';

const VERDICT_KEY: Record<UsualFormVerdict, string> = {
  clearlyWorse: 'stats.usualFormVerdictClearlyWorse',
  worse: 'stats.usualFormVerdictWorse',
  usual: 'stats.usualFormVerdictUsual',
  better: 'stats.usualFormVerdictBetter',
  clearlyBetter: 'stats.usualFormVerdictClearlyBetter',
};

const percent = (share: number) => `${Math.round(share * 100)}%`;

function MarkBar({ usual, today, sd }: { usual: number; today: number; sd: number | null }) {
  const theme = useTheme();
  const marks = usualFormMarks(usual, today, sd);
  return (
    <View style={[styles.track, { backgroundColor: theme.border }]}>
      <View
        testID="usual-form-mark-usual"
        style={[
          styles.mark,
          { left: `${marks.usual * 100}%`, backgroundColor: theme.textSecondary },
        ]}
      />
      <View
        testID="usual-form-mark-today"
        style={[
          styles.mark,
          styles.todayMark,
          { left: `${marks.today * 100}%`, backgroundColor: theme.primary },
        ]}
      />
    </View>
  );
}

function Legend() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.legend}>
      <View style={[styles.swatch, { backgroundColor: theme.textSecondary }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('stats.usualFormUsual')}
      </ThemedText>
      <View style={[styles.swatch, { backgroundColor: theme.primary }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('stats.usualFormToday')}
      </ThemedText>
    </View>
  );
}

function MeanRow(props: {
  testID: string;
  label: string;
  usual: number;
  today: number;
  sd: number | null;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.row} testID={props.testID}>
      <ThemedText type="small">{props.label}</ThemedText>
      <MarkBar usual={props.usual} today={props.today} sd={props.sd} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('stats.usualFormLine', {
          usual: tenthsToScore(props.usual).toFixed(2),
          today: tenthsToScore(props.today).toFixed(2),
          delta: signed(tenthsToScore(props.today - props.usual), 2),
        })}
      </ThemedText>
    </View>
  );
}

function ShareRow(props: { testID: string; label: string; today: number; usual: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row} testID={props.testID}>
      <ThemedText type="small">{props.label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('stats.usualFormShareLine', {
          today: percent(props.today),
          usual: percent(props.usual),
          delta: signed(Math.round(props.today * 100) - Math.round(props.usual * 100), 0),
        })}
      </ThemedText>
    </View>
  );
}

export function UsualFormBlock({ comparison }: { comparison: UsualFormComparison | null }) {
  const { t } = useTranslation();
  const baseline = comparison?.baseline;
  const session = comparison?.session;

  return (
    <View style={styles.block} testID="usual-form">
      <ThemedText type="smallBold">{t('stats.usualFormTitle')}</ThemedText>
      {!comparison || !baseline || !session || baseline.seriesCount === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" testID="usual-form-none">
          {t('stats.usualFormNone')}
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" testID="usual-form-basis">
            {t('stats.usualFormBasis', { count: baseline.seriesCount })}
          </ThemedText>
          <ThemedText
            type={comparison.verdict ? 'default' : 'small'}
            themeColor={comparison.verdict ? undefined : 'textSecondary'}
            testID="usual-form-verdict"
          >
            {comparison.verdict ? t(VERDICT_KEY[comparison.verdict]) : t('stats.usualFormTooFew')}
          </ThemedText>

          {session.seriesMeanTenths !== null && baseline.seriesMeanTenths !== null && <Legend />}
          {session.seriesMeanTenths !== null && baseline.seriesMeanTenths !== null && (
            <MeanRow
              testID="usual-form-series"
              label={t('stats.usualFormPerSeries')}
              usual={baseline.seriesMeanTenths}
              today={session.seriesMeanTenths}
              sd={baseline.seriesSdTenths}
            />
          )}
          {session.shotMeanTenths !== null && baseline.shotMeanTenths !== null && (
            <MeanRow
              testID="usual-form-shot"
              label={t('stats.usualFormPerShot')}
              usual={baseline.shotMeanTenths}
              today={session.shotMeanTenths}
              sd={baseline.shotSdTenths}
            />
          )}

          {comparison.expectedTotalTenths !== null && comparison.overUnderTenths !== null && (
            <View style={styles.row} testID="usual-form-expected">
              <ThemedText type="small">{t('stats.usualFormExpectedTitle')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('stats.usualFormExpected', {
                  expected: tenthsToScore(comparison.expectedTotalTenths).toFixed(1),
                  scored: formatTotalScore(session.totalTenths),
                  delta: signed(tenthsToScore(comparison.overUnderTenths), 1),
                })}
              </ThemedText>
            </View>
          )}

          {session.tenShare !== null && baseline.tenShare !== null && (
            <ShareRow
              testID="usual-form-tens"
              label={t('stats.usualFormTens')}
              today={session.tenShare}
              usual={baseline.tenShare}
            />
          )}
          {session.nineOrBetterShare !== null && baseline.nineOrBetterShare !== null && (
            <ShareRow
              testID="usual-form-nines"
              label={t('stats.usualFormNines')}
              today={session.nineOrBetterShare}
              usual={baseline.nineOrBetterShare}
            />
          )}
        </>
      )}
    </View>
  );
}

const MARK_WIDTH = 4;

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.half,
  },
  track: {
    height: 8,
    borderRadius: Radius.small,
    marginHorizontal: MARK_WIDTH,
  },
  mark: {
    position: 'absolute',
    top: -4,
    width: MARK_WIDTH,
    height: 16,
    marginLeft: -MARK_WIDTH / 2,
    borderRadius: MARK_WIDTH / 2,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  swatch: {
    width: MARK_WIDTH,
    height: 12,
    borderRadius: MARK_WIDTH / 2,
    marginLeft: Spacing.one,
  },
  todayMark: {
    top: -6,
    height: 20,
  },
});
