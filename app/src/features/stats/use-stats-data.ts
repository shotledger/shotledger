// Statistics data layer. The Statistics tab opens on the results for its
// filter (#822, direction A; before that it was a filter form that generated
// a report on another screen), so this file has two halves:
//
//   - `useAnalyticsFilterOptions` — what the filter sheet can offer (which
//     disciplines, series lengths and tags actually exist).
//   - `useAnalyticsReport` — the report for one filter, and the same report
//     over the period before it, which the headline's trend compares with.
//
// The filter, the period resolution and the report itself are composed in
// @shotledger/shared (analytics-rows); this file only loads from the DB.
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  buildFilterOptions,
  composeAnalyticsReport,
  decodeAnalyticsFilter,
  encodeAnalyticsFilter,
  previousPeriodRange,
  type AnalyticsFilterOptions,
  type AnalyticsFilterState,
  type AnalyticsReportData,
} from '@shotledger/shared';

import { db } from '@/db/client';
import {
  listAllAnalyticsSeries,
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
  previousPeriodRange,
  STATS_PERIODS,
  statsHeadline,
  toAnalyticsFilter,
  type AnalyticsFilterOptions,
  type AnalyticsFilterState,
  type AnalyticsReportData,
  type DistributionBucket,
  type NamedRecord,
  type PeriodRange,
  type StatsHeadline,
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

// --- Report ------------------------------------------------------------------

export interface AnalyticsReportPair {
  data: AnalyticsReportData;
  /** The previous equal period, every other filter kept; `null` for all time. */
  previous: AnalyticsReportData | null;
}

function loadReport(state: AnalyticsFilterState): AnalyticsReportPair {
  const inputs = {
    series: listAllAnalyticsSeries(db),
    sessions: listAnalyticsSessions(db),
    falt: listFaltAnalyticsSessions(db),
    tags: listTags(db),
    sessionNames: new Map(listSessions(db).map((session) => [session.id, session.name] as const)),
    birthYear: getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null),
  };
  const nowMs = Date.now();
  const previousRange = previousPeriodRange(state, nowMs);
  return {
    data: composeAnalyticsReport(state, inputs, nowMs),
    previous:
      previousRange === null ? null : composeAnalyticsReport(state, inputs, nowMs, previousRange),
  };
}

/**
 * Recomputed when the filter changes (the sheet applies live) and whenever
 * the tab regains focus, so a session logged elsewhere shows up on return.
 */
export function useAnalyticsReport(state: AnalyticsFilterState): AnalyticsReportPair {
  const key = encodeAnalyticsFilter(state);
  const [focusCount, setFocusCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setFocusCount((count) => count + 1);
    }, []),
  );

  // `focusCount` is a dependency on purpose: it is what reloads on focus.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => loadReport(decodeAnalyticsFilter(key)), [key, focusCount]);
}
