// The one number the Statistics tab opens on, and how it moved against the
// period before (#822, direction A). Shared so the phone and the web lead
// with the same number and the same comparison.
import { tenthsToScore } from '../scoring/totals';
import type { AnalyticsReportData } from './report';

/**
 * What the headline measures. A ring report leads with the average series
 * total; a report with no ring card (a hits discipline picked) leads with
 * the fält hit rate, the number its own card leads with.
 */
export type StatsHeadlineKind = 'meanPerSeries' | 'hitRate';

export interface StatsHeadline {
  kind: StatsHeadlineKind;
  /** Points per series, or a 0–1 hit rate. `null` when nothing is scored. */
  value: number | null;
  /**
   * The same measure over the previous equal period: `null` when there is no
   * previous period (all time) or nothing scored in it.
   */
  previous: number | null;
  /** `value - previous`, when both exist. */
  delta: number | null;
}

function measure(kind: StatsHeadlineKind, data: AnalyticsReportData): number | null {
  if (kind === 'hitRate') return data.falt?.totals.hitRate ?? null;
  const tenths = data.totals.meanSeriesTenths;
  return tenths === null ? null : tenthsToScore(tenths);
}

/**
 * The headline for `current`, compared with `previous` (the report composed
 * over `previousPeriodRange`, every other filter kept), or `null` when the
 * report has neither a ring card nor fält to lead with.
 */
export function statsHeadline(
  current: AnalyticsReportData,
  previous: AnalyticsReportData | null,
): StatsHeadline | null {
  const kind: StatsHeadlineKind | null = current.showRingCards
    ? 'meanPerSeries'
    : current.falt
      ? 'hitRate'
      : null;
  if (kind === null) return null;
  const value = measure(kind, current);
  const before = previous === null ? null : measure(kind, previous);
  return {
    kind,
    value,
    previous: before,
    delta: value === null || before === null ? null : value - before,
  };
}
