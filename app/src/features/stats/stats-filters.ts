// The Statistics filter as words (#822, direction A): the chips the Filter
// Bar shows for what is set, what removing one does, and the line under the
// title that names the period. No react-native import, so the web's
// Statistics page uses these same functions (web/src/statistics.tsx).
import type { TFunction } from 'i18next';

import {
  DEFAULT_ANALYTICS_FILTER,
  previousPeriodRange,
  statsHeadline,
  type AnalyticsFilterState,
  type AnalyticsReportData,
  type TagOption,
} from '@shotledger/shared';

// Relative, not `@/`: the web resolves this file without the app's alias.
import { disciplineLabel } from '../session/labels';

export interface StatsFilterChip {
  key: string;
  label: string;
}

const TAG_PREFIX = 'tag:';

/** The period in words: "Last 6 months", "All time", "1 Sep 2026 – 30 Sep 2026". */
export function periodLabel(
  t: TFunction,
  filter: Pick<AnalyticsFilterState, 'period' | 'customFrom' | 'customTo'>,
  formatDay: (day: string) => string,
): string {
  switch (filter.period) {
    case '30d':
      return t('statsA.periodLast30Days');
    case '6m':
      return t('statsA.periodLast6Months');
    case '12m':
      return t('statsA.periodLast12Months');
    case 'all':
      return t('statsA.periodAll');
    case 'custom':
      return t('statsA.periodCustom', {
        from: filter.customFrom ? formatDay(filter.customFrom) : '…',
        to: filter.customTo ? formatDay(filter.customTo) : '…',
      });
  }
}

/**
 * One chip per filter that differs from the default, in the sheet's order.
 * The period is not a chip: it is always set, and the title's subtitle names
 * it.
 */
export function statsFilterChips(
  t: TFunction,
  filter: AnalyticsFilterState,
  tags: readonly TagOption[],
): StatsFilterChip[] {
  const chips: StatsFilterChip[] = [];
  if (filter.sessionType !== null) {
    chips.push({ key: 'type', label: t(`sessionType.${filter.sessionType}`) });
  }
  if (filter.disciplineId !== null) {
    chips.push({ key: 'discipline', label: disciplineLabel(t, filter.disciplineId) });
  }
  if (filter.shotsPerSeries !== null) {
    chips.push({
      key: 'shotsPerSeries',
      label: t('statsA.chipShotsPerSeries', { count: filter.shotsPerSeries }),
    });
  }
  if (!filter.includeSighters) {
    chips.push({ key: 'sighters', label: t('statsA.chipSightersExcluded') });
  }
  for (const tag of tags) {
    if (filter.tagIds.includes(tag.id)) {
      chips.push({ key: `${TAG_PREFIX}${tag.id}`, label: tag.name });
    }
  }
  return chips;
}

/** The filter with one chip's setting back at its default. */
export function removeStatsFilter(filter: AnalyticsFilterState, key: string): AnalyticsFilterState {
  if (key.startsWith(TAG_PREFIX)) {
    const id = key.slice(TAG_PREFIX.length);
    return { ...filter, tagIds: filter.tagIds.filter((existing) => existing !== id) };
  }
  switch (key) {
    case 'type':
      return { ...filter, sessionType: null };
    case 'discipline':
      return { ...filter, disciplineId: null };
    case 'shotsPerSeries':
      return { ...filter, shotsPerSeries: null };
    case 'sighters':
      return { ...filter, includeSighters: DEFAULT_ANALYTICS_FILTER.includeSighters };
    default:
      return filter;
  }
}

/**
 * Clear All: every chip's setting back at its default. The period stays —
 * it has no chip, so clearing the chips should not move it.
 */
export function clearStatsFilters(filter: AnalyticsFilterState): AnalyticsFilterState {
  return {
    ...DEFAULT_ANALYTICS_FILTER,
    period: filter.period,
    customFrom: filter.customFrom,
    customTo: filter.customTo,
  };
}

/** The headline's change against the previous period, signed: "+0.8", "−1.2", "±0.0". */
export function formatSignedDelta(delta: number, decimals: number): string {
  const fixed = Math.abs(delta).toFixed(decimals);
  if (Number(fixed) === 0) return `±${fixed}`;
  return `${delta > 0 ? '+' : '−'}${fixed}`;
}

/** "the previous 6 months": what the trend line compares with. */
function previousPeriodNoun(t: TFunction, filter: AnalyticsFilterState): string {
  switch (filter.period) {
    case '30d':
      return t('statsA.previous30Days');
    case '6m':
      return t('statsA.previous6Months');
    case '12m':
      return t('statsA.previous12Months');
    case 'all':
    case 'custom': {
      const range = previousPeriodRange(filter);
      const days =
        range === null
          ? 0
          : Math.round((Date.parse(range.toIso!) + 1 - Date.parse(range.fromIso!)) / 86_400_000);
      return t('statsA.previousDays', { count: days });
    }
  }
}

/** The headline's trend line, or `null` when there is nothing to compare with. */
export function trendLine(
  t: TFunction,
  filter: AnalyticsFilterState,
  data: AnalyticsReportData,
  previous: AnalyticsReportData | null,
): string | null {
  const headline = statsHeadline(data, previous);
  if (headline === null || headline.value === null || previous === null) return null;
  const period = previousPeriodNoun(t, filter);
  if (headline.delta === null) return t('statsA.trendNone', { period });
  const delta =
    headline.kind === 'hitRate'
      ? t('statsA.deltaPercentPoints', { delta: formatSignedDelta(headline.delta * 100, 0) })
      : formatSignedDelta(headline.delta, 1);
  return t('statsA.trend', { delta, period });
}
