// Statistics tab — the filter form. The report it generates lives on
// /stats/report; nothing on this screen computes statistics, it only
// describes which sessions the report should cover.
//
// The rebuild replaced M5's always-live view (maintainer: "would like the
// UI/UX to be more streamlined ... statistics can be generic but also
// generated on the fly"). Every filter dimension is a plain stored column,
// so the report is federation-agnostic.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { MultiOptionPicker } from '@/components/multi-option-picker';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { disciplineLabel } from '@/features/session/labels';
import {
  DEFAULT_ANALYTICS_FILTER,
  encodeAnalyticsFilter,
  useAnalyticsFilterOptions,
  type AnalyticsFilterState,
  type StatsPeriod,
} from '@/features/stats/use-stats-data';
import { Spacing } from '@/theme/tokens';
import { localDayOf, localDayStartIso } from '@/features/dates/local-day';

const ALL = 'all-values';
type TypeChoice = typeof ALL | 'training' | 'competition';
type SighterChoice = 'include' | 'exclude';

function toDateOnly(date: Date): string {
  return localDayOf(date.toISOString());
}

/** One labelled filter section: title, one-line explanation, control. */
function FilterCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {hint}
      </ThemedText>
      {children}
    </Card>
  );
}

export default function StatsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTER);
  const [pickerOpen, setPickerOpen] = useState<'from' | 'to' | null>(null);
  const [openSection, setOpenSection] = useState<'discipline' | 'tags' | null>(null);
  const options = useAnalyticsFilterOptions();
  const scrollRef = useRef<ScrollView>(null);

  // The filter is deliberately sticky — you build it, generate a report, come
  // back and adjust. What it must not do is come back *invisible*: the tab
  // kept its scroll offset too, so returning and tapping where a control had
  // been toggled whatever now sat there, a tag chip in the case that found
  // this (#349). Returning to the top, with any expanded picker collapsed,
  // puts the retained filter back in front of the user before the first tap.
  useFocusEffect(
    useCallback(() => {
      setOpenSection(null);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

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

  const formatDay = (day: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(day));

  const disciplineValue = filter.disciplineId
    ? disciplineLabel(t, filter.disciplineId)
    : t('stats.all');
  const tagValue =
    filter.tagIds.length === 0
      ? t('stats.tagsNone')
      : options.tags
          .filter((tag) => filter.tagIds.includes(tag.id))
          .map((tag) => tag.name)
          .join(', ');

  if (!options.hasAnyData) {
    return (
      <Screen>
        <ScreenTitle>{t('stats.title')}</ScreenTitle>
        <EmptyState title={t('stats.emptyTitle')} body={t('stats.emptyBody')} />
      </Screen>
    );
  }

  return (
    <Screen scrollRef={scrollRef}>
      <ScreenTitle>{t('stats.title')}</ScreenTitle>

      <Card>
        <DrillDownRow
          title={t('webshooter.recordsTitle')}
          subtitle={t('webshooter.recordsSubtitle')}
          onPress={() => router.push('/stats/records')}
          testID="stats-open-records"
        />
        <DrillDownRow
          title={t('ammo.compareOpen')}
          subtitle={t('ammo.compareOpenSubtitle')}
          onPress={() => router.push('/ammo/compare')}
          testID="stats-open-ammo-compare"
        />
      </Card>

      <FilterCard title={t('stats.sectionPeriod')} hint={t('stats.sectionPeriodHint')}>
        <SegmentedControl
          options={periodOptions}
          value={filter.period}
          onChange={(period: StatsPeriod) => setFilter((f) => ({ ...f, period }))}
        />
        {filter.period === 'custom' && (
          <View style={styles.dateRows}>
            <DrillDownRow
              title={t('period.from')}
              value={filter.customFrom ? formatDay(filter.customFrom) : '—'}
              onPress={() => setPickerOpen('from')}
              testID="stats-custom-from"
            />
            <DrillDownRow
              title={t('period.to')}
              value={filter.customTo ? formatDay(filter.customTo) : '—'}
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
              setPickerOpen(null);
              if (!selected) return;
              const value = toDateOnly(selected);
              setFilter((f) =>
                pickerOpen === 'from' ? { ...f, customFrom: value } : { ...f, customTo: value },
              );
            }}
          />
        )}
      </FilterCard>

      <FilterCard title={t('stats.sectionType')} hint={t('stats.sectionTypeHint')}>
        <SegmentedControl
          options={[
            { value: ALL as TypeChoice, label: t('stats.all') },
            { value: 'training' as TypeChoice, label: t('sessionType.training') },
            { value: 'competition' as TypeChoice, label: t('sessionType.competition') },
          ]}
          value={(filter.sessionType ?? ALL) as TypeChoice}
          onChange={(value) =>
            setFilter((f) => ({ ...f, sessionType: value === ALL ? null : value }))
          }
        />
      </FilterCard>

      <FilterCard title={t('stats.sectionSighters')} hint={t('stats.sectionSightersHint')}>
        <SegmentedControl
          testID="stats-sighters"
          options={[
            { value: 'include' as SighterChoice, label: t('stats.sightersInclude') },
            { value: 'exclude' as SighterChoice, label: t('stats.sightersExclude') },
          ]}
          value={filter.includeSighters ? 'include' : 'exclude'}
          onChange={(choice) => setFilter((f) => ({ ...f, includeSighters: choice === 'include' }))}
        />
      </FilterCard>

      <FilterCard title={t('session.discipline')} hint={t('stats.sectionDisciplineHint')}>
        <DrillDownRow
          title={t('stats.sectionDisciplineChoice')}
          value={disciplineValue}
          expanded={openSection === 'discipline'}
          onPress={() => setOpenSection((open) => (open === 'discipline' ? null : 'discipline'))}
          testID="stats-discipline-row"
        />
        {openSection === 'discipline' && (
          <OptionPicker
            options={[
              { value: ALL, label: t('stats.all') },
              ...options.disciplineIds.map((id) => ({ value: id, label: disciplineLabel(t, id) })),
            ]}
            value={filter.disciplineId ?? ALL}
            onChange={(value) =>
              setFilter((f) => ({ ...f, disciplineId: value === ALL ? null : value }))
            }
          />
        )}
      </FilterCard>

      <FilterCard title={t('stats.sectionShotsPerSeries')} hint={t('stats.sectionShotsHint')}>
        <OptionPicker
          options={[
            { value: ALL, label: t('stats.all') },
            ...options.shotsPerSeriesValues.map((count) => ({
              value: String(count),
              label: String(count),
            })),
          ]}
          value={filter.shotsPerSeries === null ? ALL : String(filter.shotsPerSeries)}
          onChange={(value) =>
            setFilter((f) => ({
              ...f,
              shotsPerSeries: value === ALL ? null : Number.parseInt(value, 10),
            }))
          }
        />
      </FilterCard>

      <FilterCard title={t('stats.sectionTags')} hint={t('stats.sectionTagsHint')}>
        <DrillDownRow
          title={t('stats.sectionTagsChoice')}
          value={tagValue}
          expanded={openSection === 'tags'}
          onPress={() => setOpenSection((open) => (open === 'tags' ? null : 'tags'))}
          testID="stats-tags-row"
        />
        {openSection === 'tags' && (
          <MultiOptionPicker
            testID="stats-tag-picker"
            options={options.tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            values={filter.tagIds}
            emptyLabel={t('stats.tagsEmpty')}
            onToggle={(id) =>
              setFilter((f) => ({
                ...f,
                tagIds: f.tagIds.includes(id)
                  ? f.tagIds.filter((existing) => existing !== id)
                  : [...f.tagIds, id],
              }))
            }
          />
        )}
      </FilterCard>

      <PrimaryButton
        testID="stats-generate"
        label={t('stats.generate')}
        onPress={() =>
          router.push({
            pathname: '/stats/report',
            params: { filter: encodeAnalyticsFilter(filter) },
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateRows: {
    gap: Spacing.one,
  },
});
