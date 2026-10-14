// The Statistics filter, as the Filter Bar's sheet (#822, direction A). The
// six filter cards that used to fill the tab's first screen, folded into one
// sheet: every control the form had, in the same order, applied live.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DrillDownRow } from '@/components/drill-down-row';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { localDayOf, localDayStartIso } from '@/features/dates/local-day';
import { useDateFormat } from '@/features/dates/use-date-format';
import { disciplineLabel } from '@/features/session/labels';
import type {
  AnalyticsFilterOptions,
  AnalyticsFilterState,
  StatsPeriod,
} from '@/features/stats/use-stats-data';
import { Spacing } from '@/theme/tokens';

const ALL = 'all-values';
type TypeChoice = typeof ALL | 'training' | 'competition';
type SighterChoice = 'include' | 'exclude';

function toDateOnly(date: Date): string {
  return localDayOf(date.toISOString());
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

export function StatsFilterSheet({
  filter,
  options,
  onChange,
}: {
  filter: AnalyticsFilterState;
  options: AnalyticsFilterOptions;
  onChange: (update: (current: AnalyticsFilterState) => AnalyticsFilterState) => void;
}) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const [pickerOpen, setPickerOpen] = useState<'from' | 'to' | null>(null);
  // The sheet does not scroll on its own; six sections with a long
  // discipline or tag list outgrow a phone, so the controls scroll above the
  // sheet's Clear All and Close.
  const { height } = useWindowDimensions();

  const periodOptions = useMemo(
    () => [
      { value: '30d' as const, label: t('period.last30Days') },
      { value: '6m' as const, label: t('period.last6Months') },
      { value: '12m' as const, label: t('period.last12Months') },
      { value: 'all' as const, label: t('period.max') },
      { value: 'custom' as const, label: t('period.custom') },
    ],
    [t],
  );

  return (
    <ScrollView
      style={{ maxHeight: height * 0.6 }}
      contentContainerStyle={styles.sheet}
      testID="stats-filter-sheet"
    >
      <Section title={t('stats.sectionPeriod')}>
        <SegmentedControl
          options={periodOptions}
          value={filter.period}
          onChange={(period: StatsPeriod) => onChange((f) => ({ ...f, period }))}
        />
        {filter.period === 'custom' && (
          <View style={styles.dateRows}>
            <DrillDownRow
              title={t('period.from')}
              value={filter.customFrom ? dates.day(filter.customFrom) : '—'}
              onPress={() => setPickerOpen('from')}
              testID="stats-custom-from"
            />
            <DrillDownRow
              title={t('period.to')}
              value={filter.customTo ? dates.day(filter.customTo) : '—'}
              onPress={() => setPickerOpen('to')}
              testID="stats-custom-to"
            />
            {(!filter.customFrom || !filter.customTo) && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('period.rangeIncomplete')}
              </ThemedText>
            )}
          </View>
        )}
        {pickerOpen && (
          <DateTimePicker
            testID="stats-custom-date-picker"
            value={
              new Date(
                localDayStartIso(
                  (pickerOpen === 'from' ? filter.customFrom : filter.customTo) ??
                    toDateOnly(new Date()),
                ),
              )
            }
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_event, selected) => {
              const which = pickerOpen;
              setPickerOpen(null);
              if (!selected) return;
              const value = toDateOnly(selected);
              onChange((f) =>
                which === 'from' ? { ...f, customFrom: value } : { ...f, customTo: value },
              );
            }}
          />
        )}
      </Section>

      <Section title={t('stats.sectionType')}>
        <SegmentedControl
          options={[
            { value: ALL as TypeChoice, label: t('stats.all') },
            { value: 'training' as TypeChoice, label: t('sessionType.training') },
            { value: 'competition' as TypeChoice, label: t('sessionType.competition') },
          ]}
          value={(filter.sessionType ?? ALL) as TypeChoice}
          onChange={(value) =>
            onChange((f) => ({ ...f, sessionType: value === ALL ? null : value }))
          }
        />
      </Section>

      <Section title={t('stats.sectionSighters')}>
        <SegmentedControl
          testID="stats-sighters"
          options={[
            { value: 'include' as SighterChoice, label: t('stats.sightersInclude') },
            { value: 'exclude' as SighterChoice, label: t('stats.sightersExclude') },
          ]}
          value={filter.includeSighters ? 'include' : 'exclude'}
          onChange={(choice) => onChange((f) => ({ ...f, includeSighters: choice === 'include' }))}
        />
      </Section>

      <Section title={t('session.discipline')}>
        <ChoiceChips
          testID="stats-discipline"
          accessibilityLabel={t('session.discipline')}
          options={[
            { value: ALL, label: t('stats.all') },
            ...options.disciplineIds.map((id) => ({ value: id, label: disciplineLabel(t, id) })),
          ]}
          value={[filter.disciplineId ?? ALL]}
          onChange={([value]) =>
            onChange((f) => ({ ...f, disciplineId: !value || value === ALL ? null : value }))
          }
        />
      </Section>

      <Section title={t('stats.sectionShotsPerSeries')}>
        <ChoiceChips
          accessibilityLabel={t('stats.sectionShotsPerSeries')}
          options={[
            { value: ALL, label: t('stats.all') },
            ...options.shotsPerSeriesValues.map((count) => ({
              value: String(count),
              label: String(count),
            })),
          ]}
          value={[filter.shotsPerSeries === null ? ALL : String(filter.shotsPerSeries)]}
          onChange={([value]) =>
            onChange((f) => ({
              ...f,
              shotsPerSeries: !value || value === ALL ? null : Number.parseInt(value, 10),
            }))
          }
        />
      </Section>

      <Section title={t('stats.sectionTags')} hint={t('stats.sectionTagsHint')}>
        {options.tags.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('stats.tagsEmpty')}
          </ThemedText>
        ) : (
          <ChoiceChips
            testID="stats-tag-picker"
            mode="multi"
            accessibilityLabel={t('stats.sectionTags')}
            options={options.tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            value={filter.tagIds}
            onChange={(tagIds) => onChange((f) => ({ ...f, tagIds }))}
          />
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  dateRows: {
    gap: Spacing.one,
  },
});
