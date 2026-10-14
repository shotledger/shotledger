// The full sessions list (#317). The app is a logbook, and until this screen
// existed only the ten most recent sessions were reachable anywhere in the UI
// — 257 of the maintainer's 267 imported sessions could be opened only by
// deep link.
//
// One FlatList owns the screen, with the filters as its header: nesting a list
// inside a scrolling Screen gives two competing scroll surfaces (see the note
// atop about/licenses.tsx, which had exactly that bug).
import { getDiscipline } from '@shotledger/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { OptionPicker } from '@/components/option-picker';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import {
  EMPTY_SESSION_FILTER,
  filterSessionRows,
  isFilterActive,
  type SessionPeriod,
  type SessionListFilter,
} from '@/features/sessions/session-filters';
import { SessionRow } from '@/features/sessions/session-row';
import { useSessionsList } from '@/features/sessions/use-sessions-list';
import { Spacing } from '@/theme/tokens';
import { localDayOf, localDayStartIso } from '@/features/dates/local-day';
import { useDateFormat } from '@/features/dates/use-date-format';

export default function SessionsListScreen() {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const { rows, disciplineIds, tagNames, firearms } = useSessionsList();

  // `/sessions?tag=Behöver granskning` — so a tag count in Statistics can open
  // the sessions behind it. A tag that can be counted but whose sessions can
  // never be listed cannot do the job it exists for (#317).
  const { tag: tagParam } = useLocalSearchParams<{ tag?: string }>();
  const [filter, setFilter] = useState<SessionListFilter>(() => ({
    ...EMPTY_SESSION_FILTER,
    tag: tagParam ?? 'all',
  }));

  // Collapsed by default. The rows are what this screen is for, and reaching a
  // competition from a few weeks ago used to mean scrolling past six controls
  // first (#348). Search stays out here because it is the one people use most;
  // everything else is one tap away, summarised so its state is never hidden.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<'from' | 'to' | null>(null);

  const visible = useMemo(() => filterSessionRows(rows, filter), [rows, filter]);

  const periodOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('period.max') },
      { value: '30d' as const, label: t('period.last30Days') },
      { value: '6m' as const, label: t('period.last6Months') },
      { value: '12m' as const, label: t('period.last12Months') },
      { value: 'custom' as const, label: t('period.custom') },
    ],
    [t],
  );

  const formatDay = dates.day;

  function set<K extends keyof SessionListFilter>(key: K, value: SessionListFilter[K]) {
    setFilter((current) => ({ ...current, [key]: value }));
  }

  const disciplineOptions = [
    { value: 'all', label: t('sessions.filterAll') },
    ...disciplineIds.map((id) => ({
      value: id,
      label: getDiscipline(id) ? t(`discipline.${id}` as const) : id,
    })),
  ];

  const tagOptions = [
    { value: 'all', label: t('sessions.filterAll') },
    ...tagNames.map((name) => ({ value: name, label: name })),
  ];

  const firearmOptions = [
    { value: 'all', label: t('sessions.filterAll') },
    ...firearms.map((firearm) => ({ value: firearm.id, label: firearm.label })),
    { value: 'none', label: t('sessions.filterNoFirearm') },
  ];

  /** What the collapsed row shows, so a filter is never active but invisible. */
  const activeSummary = [
    filter.period === 'all' ? null : periodOptions.find((o) => o.value === filter.period)?.label,
    filter.type === 'all' ? null : t(`sessionType.${filter.type}`),
    filter.shape === 'all'
      ? null
      : t(filter.shape === 'series' ? 'home.shapeSeries' : 'home.shapeRounds'),
    filter.disciplineId === 'all'
      ? null
      : disciplineOptions.find((o) => o.value === filter.disciplineId)?.label,
    filter.tag === 'all' ? null : filter.tag,
    filter.firearmId === 'all'
      ? null
      : firearmOptions.find((o) => o.value === filter.firearmId)?.label,
  ].filter(Boolean);

  const header = (
    <View style={styles.filters}>
      <TextField
        testID="sessions-search"
        accessibilityLabel={t('sessions.searchLabel')}
        placeholder={t('sessions.searchPlaceholder')}
        value={filter.query}
        onChangeText={(value) => set('query', value)}
      />
      <DrillDownRow
        testID="sessions-filters-row"
        title={t('sessions.filtersTitle')}
        value={activeSummary.length === 0 ? t('sessions.filtersNone') : activeSummary.join(' · ')}
        expanded={filtersOpen}
        onPress={() => setFiltersOpen((open) => !open)}
      />
      {filtersOpen && (
        <>
          <SegmentedControl
            testID="sessions-period-filter"
            options={periodOptions}
            value={filter.period}
            onChange={(value: SessionPeriod) => set('period', value)}
          />
          {filter.period === 'custom' && (
            <View style={styles.dateRows}>
              <DrillDownRow
                title={t('period.from')}
                value={filter.customFrom ? formatDay(filter.customFrom) : '—'}
                onPress={() => setPickerOpen('from')}
                testID="sessions-custom-from"
              />
              <DrillDownRow
                title={t('period.to')}
                value={filter.customTo ? formatDay(filter.customTo) : '—'}
                onPress={() => setPickerOpen('to')}
                testID="sessions-custom-to"
              />
            </View>
          )}
          {pickerOpen && (
            <DateTimePicker
              testID="sessions-custom-date-picker"
              value={
                new Date(
                  localDayStartIso(
                    (pickerOpen === 'from' ? filter.customFrom : filter.customTo) ??
                      localDayOf(new Date().toISOString()),
                  ),
                )
              }
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_event, selected) => {
                setPickerOpen(null);
                if (!selected) return;
                const value = localDayOf(selected.toISOString());
                setFilter((current) =>
                  pickerOpen === 'from'
                    ? { ...current, customFrom: value }
                    : { ...current, customTo: value },
                );
              }}
            />
          )}
          <SegmentedControl
            testID="sessions-type-filter"
            options={[
              { value: 'all' as const, label: t('sessions.filterAll') },
              { value: 'training' as const, label: t('sessionType.training') },
              { value: 'competition' as const, label: t('sessionType.competition') },
            ]}
            value={filter.type}
            onChange={(value) => set('type', value)}
          />
          <SegmentedControl
            testID="sessions-shape-filter"
            options={[
              { value: 'all' as const, label: t('sessions.filterAll') },
              { value: 'series' as const, label: t('home.shapeSeries') },
              { value: 'roundsOnly' as const, label: t('home.shapeRounds') },
            ]}
            value={filter.shape}
            onChange={(value) => set('shape', value)}
          />
          {disciplineIds.length > 1 && (
            <OptionPicker
              label={t('sessions.filterDiscipline')}
              options={disciplineOptions}
              value={filter.disciplineId}
              onChange={(value) => set('disciplineId', value)}
            />
          )}
          {tagNames.length > 0 && (
            <OptionPicker
              label={t('sessions.filterTag')}
              options={tagOptions}
              value={filter.tag}
              onChange={(value) => set('tag', value)}
            />
          )}
          {firearms.length > 0 && (
            <OptionPicker
              label={t('sessions.filterFirearm')}
              options={firearmOptions}
              value={filter.firearmId}
              onChange={(value) => set('firearmId', value)}
            />
          )}
        </>
      )}
      {/* The count is the point of the screen as much as the rows are: it is
          how a shooter sees that a filter matched 36 sessions, not 3. */}
      <ThemedText type="small" themeColor="textSecondary" testID="sessions-count">
        {isFilterActive(filter)
          ? t('sessions.countFiltered', { shown: visible.length, total: rows.length })
          : t('sessions.count', { count: rows.length })}
      </ThemedText>
    </View>
  );

  return (
    <Screen scroll={false}>
      <ScreenTitle>{t('sessions.title')}</ScreenTitle>
      <FlatList
        testID="sessions-list"
        data={visible}
        keyExtractor={(row) => row.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          rows.length === 0 ? (
            <EmptyState title={t('sessions.emptyTitle')} body={t('sessions.emptyBody')} />
          ) : (
            <EmptyState
              title={t('sessions.noMatchTitle')}
              body={t('sessions.noMatchBody')}
              ctaLabel={t('sessions.clearFilters')}
              onPressCta={() => setFilter(EMPTY_SESSION_FILTER)}
            />
          )
        }
        renderItem={({ item, index }) => (
          <SessionRow
            testID={`sessions-row-${index}`}
            session={item}
            onPress={() => router.push(`/session/${item.id}`)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two, paddingBottom: Spacing.four },
  filters: { gap: Spacing.two, marginBottom: Spacing.two },
  dateRows: { gap: Spacing.one },
});
