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

/** Conventional "average" glyph (U+2300 DIAMETER SIGN) for the row subtitle. */
export const AVERAGE_SYMBOL = '⌀';

/**
 * A session's logging shape (maintainer, 2026-09-03): either it was entered
 * as scored series, or as a fixed number of fired-but-unscored rounds only
 * (`extra_rounds`, no series at all). `null` when a session has neither —
 * nothing was logged for it yet.
 */
export type SessionShape = 'series' | 'roundsOnly';
export type SessionShapeFilter = 'all' | SessionShape;

export interface HomeSessionRow {
  id: string;
  name: string;
  type: 'training' | 'competition';
  startedAt: string;
  total: number;
  /** Mean of the session's scored series, in display points. `null` when none. */
  seriesAverage: number | null;
  /** Inner tens (Swedish: innertior) in the session's scored series. */
  innerTenCount: number;
  shape: SessionShape | null;
}

/**
 * Derives the session's logging shape from its content: any series at all
 * (scored or sighter — the series-entry flow was used) beats a plain round
 * count. `extraRounds` on top of a series session doesn't change its shape.
 *
 * This is a **stand-in**. The maintainer has decided the shape will become
 * an explicit `session.kind` column, set at creation (Drizzle migration,
 * branch `feat/session-kind-and-new-session`, not started yet) — once that
 * column exists, this function's body becomes a read of it, and every
 * caller (`buildHomeSessionRow` below) needs no change.
 */
export function deriveSessionShapeFromContent(
  sessionSeries: readonly StatsSeries[],
  extraRounds: number | null,
): SessionShape | null {
  if (sessionSeries.length > 0) return 'series';
  if ((extraRounds ?? 0) > 0) return 'roundsOnly';
  return null;
}

/**
 * Builds one Home session row from its series. WS1: a total-override series
 * (WebShooter/ShotLog import) has no `shots` rows — `sessionResults` uses
 * its stored total instead of summing an empty array, matching the
 * session-detail and session-list screens (never sum `shots` directly here).
 */
export function buildHomeSessionRow(
  session: {
    id: string;
    name: string;
    type: 'training' | 'competition';
    startedAt: string;
    extraRounds?: number | null;
  },
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
    shape: deriveSessionShapeFromContent(sessionSeries, session.extraRounds ?? null),
  };
}

/** `311p` — no whitespace before the suffix (maintainer, 2026-09-03). */
export function formatSessionTotal(total: number): string {
  return `${total}p`;
}

/** `⌀ 45.0` — the average glyph, then the value to one decimal place. */
export function formatSeriesAverage(average: number): string {
  return `${AVERAGE_SYMBOL} ${average.toFixed(1)}`;
}

/** Filters rows by logging shape; `'all'` (the default) returns every row. */
export function filterSessionRowsByShape(
  rows: readonly HomeSessionRow[],
  filter: SessionShapeFilter,
): HomeSessionRow[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => row.shape === filter);
}
