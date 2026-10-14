// Statistics tab (#822, direction A "Instrument"): opens on the results for
// the current filter. The Filter Bar at the top holds the filter (chips for
// what is set, a sheet for the controls) and every change applies at once;
// the results below are `StatsResults`, which carries every number the old
// generated report did. There is no Generate Report step any more.
//
// Every filter dimension is a plain stored column, so the results are
// federation-agnostic. The filter lives here for the life of the tab, so it
// survives a visit to a session or to Records.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { Header } from '@/components/header';
import { Screen } from '@/components/screen';
import { useDateFormat } from '@/features/dates/use-date-format';
import { StatsFilterSheet } from '@/features/stats/stats-filter-sheet';
import {
  clearStatsFilters,
  periodLabel,
  removeStatsFilter,
  statsFilterChips,
} from '@/features/stats/stats-filters';
import { StatsResults } from '@/features/stats/stats-results';
import {
  DEFAULT_ANALYTICS_FILTER,
  useAnalyticsFilterOptions,
  useAnalyticsReport,
  type AnalyticsFilterState,
} from '@/features/stats/use-stats-data';

export default function StatsScreen() {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const [filter, setFilter] = useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);
  const options = useAnalyticsFilterOptions();
  const { data, previous } = useAnalyticsReport(filter);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);

  // Coming back to the tab starts at the top, where the filter and the lead
  // are, rather than wherever the long detail was left (#349).
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  const recordsButton = (
    <Button
      variant="text"
      label={t('webshooter.recordsTitle')}
      onPress={() => router.push('/stats/records')}
      testID="stats-open-records"
    />
  );

  if (!options.hasAnyData) {
    return (
      <Screen>
        <Header title={t('stats.title')} trailing={recordsButton} />
        <EmptyState title={t('stats.emptyTitle')} body={t('stats.emptyBody')} />
      </Screen>
    );
  }

  const chips = statsFilterChips(t, filter, options.tags);

  return (
    <Screen scrollRef={scrollRef} contentRef={contentRef}>
      <Header
        title={t('stats.title')}
        subtitle={`${periodLabel(t, filter, dates.day)} · ${t('sessions.count', {
          count: data.totals.sessionCount,
        })}`}
        trailing={recordsButton}
        testID="stats-header"
      />

      <FilterBar
        testID="stats-filter-bar"
        filters={chips}
        onRemove={(key) => setFilter((f) => removeStatsFilter(f, key))}
        sheetOpen={sheetOpen}
        onOpenSheet={() => setSheetOpen(true)}
        onCloseSheet={() => setSheetOpen(false)}
        onClearAll={() => setFilter((f) => clearStatsFilters(f))}
      >
        <StatsFilterSheet filter={filter} options={options} onChange={setFilter} />
      </FilterBar>

      <StatsResults
        filter={filter}
        data={data}
        previous={previous}
        scrollRef={scrollRef}
        contentRef={contentRef}
      />

      <Card>
        <DrillDownRow
          title={t('ammo.compareOpen')}
          subtitle={t('ammo.compareOpenSubtitle')}
          onPress={() => router.push('/ammo/compare')}
          testID="stats-open-ammo-compare"
        />
      </Card>
    </Screen>
  );
}
