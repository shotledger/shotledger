// Pure builder for one Home session row (§4 M2, spec Amendment A2 §A2.4).
// Kept free of any DB import so it can be jest-unit-tested without pulling
// in the native expo-sqlite client (see use-home-data.test.ts).
import {
  seriesAverageTenths,
  sessionInnerTenCount,
  sessionResults,
  tenthsToScore,
  type StatsSeries,
} from '@shotledger/shared';

export interface HomeSessionRow {
  id: string;
  name: string;
  type: 'training' | 'competition';
  startedAt: string;
  total: number;
  /** Mean of the session's scored series, in display points. `null` when none. */
  seriesAverage: number | null;
  /** Centrumtior in the session's scored series. */
  innerTenCount: number;
}

/**
 * Builds one Home session row from its series. WS1: a total-override series
 * (WebShooter/ShotLog import) has no `shots` rows — `sessionResults` uses
 * its stored total instead of summing an empty array, matching the
 * session-detail and session-list screens (never sum `shots` directly here).
 */
export function buildHomeSessionRow(
  session: { id: string; name: string; type: 'training' | 'competition'; startedAt: string },
  sessionSeries: readonly StatsSeries[],
): HomeSessionRow {
  const average = seriesAverageTenths(sessionSeries);
  return {
    id: session.id,
    name: session.name,
    type: session.type,
    startedAt: session.startedAt,
    total: tenthsToScore(sessionResults(sessionSeries).totalTenths),
    seriesAverage: average === null ? null : tenthsToScore(average),
    innerTenCount: sessionInnerTenCount(sessionSeries),
  };
}
