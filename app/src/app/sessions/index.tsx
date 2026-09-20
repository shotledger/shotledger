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
import { FlatList, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SegmentedControl } from '@/components/segmented-control';
import { TagChips } from '@/components/tag-chips';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { formatSeriesAverage, formatSessionTotal } from '@/features/home/home-session-row';
import { formatSessionDate } from '@/features/home/format-session-date';
import {
  EMPTY_SESSION_FILTER,
  filterSessionRows,
  isFilterActive,
  type SessionListFilter,
} from '@/features/sessions/session-filters';
import { useSessionsList } from '@/features/sessions/use-sessions-list';
import { Spacing } from '@/theme/tokens';

export default function SessionsListScreen() {
  const { t, i18n } = useTranslation();
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

  const visible = useMemo(() => filterSessionRows(rows, filter), [rows, filter]);

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

  const header = (
    <View style={styles.filters}>
      <TextField
        testID="sessions-search"
        accessibilityLabel={t('sessions.searchLabel')}
        placeholder={t('sessions.searchPlaceholder')}
        value={filter.query}
        onChangeText={(value) => set('query', value)}
      />
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
          <ListRow
            testID={`sessions-row-${index}`}
            title={item.name}
            subtitle={[
              formatSessionDate(item.startedAt, i18n.language),
              formatSessionTotal(item.total),
              item.seriesAverage === null ? null : formatSeriesAverage(item.seriesAverage),
              item.seriesAverage === null ? null : `${item.innerTenCount}X`,
            ]
              .filter(Boolean)
              .join(' · ')}
            below={<TagChips names={item.tags} testID={`sessions-row-${index}-tags`} />}
            trailing={<Chip label={t(`sessionType.${item.type}`)} />}
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
});
