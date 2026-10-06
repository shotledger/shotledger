// Statistics data layer. Since the analytics rebuild the Statistics tab is
// a *filter form* that generates a report (maintainer: "see screenshots for
// how the statistics can be generic but also generated on the fly"), so
// this file has two halves:
//
//   - `useAnalyticsFilterOptions` — what the filter form can offer (which
//     disciplines, series lengths and tags actually exist).
//   - `useAnalyticsReport` — the generated report for one filter.
//
// The filter, the period resolution and the report itself are composed in
// @shotledger/shared (analytics-rows); this file only loads from the DB.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  buildFilterOptions,
  composeAnalyticsReport,
  compareRecentSeries,
  decodeAnalyticsFilter,
  encodeAnalyticsFilter,
  type AnalyticsFilterOptions,
  type AnalyticsFilterState,
  type AnalyticsReportData,
} from '@shotledger/shared';

import { db } from '@/db/client';
import {
  listAllAnalyticsSeries,
  listAllStatsSeries,
  listAnalyticsSessions,
  listFaltAnalyticsSessions,
} from '@/db/queries/stats';
import { getSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { listSessions } from '@/db/queries/sessions';
import { listTags } from '@/db/queries/tags';

// The filter state, period resolution and report composition are shared with
// the web app (ADR 0013); re-exported so the screens' imports stay put.
export {
  buildDistribution,
  decodeAnalyticsFilter,
  DEFAULT_ANALYTICS_FILTER,
  encodeAnalyticsFilter,
  periodRange,
  STATS_PERIODS,
  toAnalyticsFilter,
  type AnalyticsFilterOptions,
  type AnalyticsFilterState,
  type AnalyticsReportData,
  type DistributionBucket,
  type NamedRecord,
  type PeriodRange,
  type StatsPeriod,
  type TagOption,
} from '@shotledger/shared';

// --- Filter form -------------------------------------------------------------

function loadFilterOptions(): AnalyticsFilterOptions {
  return buildFilterOptions({
    series: listAllAnalyticsSeries(db),
    falt: listFaltAnalyticsSessions(db),
    tags: listTags(db),
  });
}

export function useAnalyticsFilterOptions(): AnalyticsFilterOptions {
  const [options, setOptions] = useState<AnalyticsFilterOptions>(loadFilterOptions);

  useFocusEffect(
    useCallback(() => {
      setOptions(loadFilterOptions());
    }, []),
  );

  return options;
}

// --- Generated report --------------------------------------------------------

function loadReport(state: AnalyticsFilterState): AnalyticsReportData {
  return composeAnalyticsReport(state, {
    series: listAllAnalyticsSeries(db),
    sessions: listAnalyticsSessions(db),
    falt: listFaltAnalyticsSessions(db),
    tags: listTags(db),
    sessionNames: new Map(listSessions(db).map((session) => [session.id, session.name] as const)),
    birthYear: getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null),
  });
}

export function useAnalyticsReport(state: AnalyticsFilterState): AnalyticsReportData {
  const [data, setData] = useState<AnalyticsReportData>(() => loadReport(state));
  const key = encodeAnalyticsFilter(state);

  useFocusEffect(
    useCallback(() => {
      setData(loadReport(decodeAnalyticsFilter(key)));
    }, [key]),
  );

  return data;
}

/** Comparison of the most recent 100 series vs the 100 before that, same discipline+class. */
export function loadComparisonForSession(disciplineId: string, shooterClass: string | null) {
  const all = listAllStatsSeries(db);
  return compareRecentSeries(all, { disciplineId, shooterClass });
}
