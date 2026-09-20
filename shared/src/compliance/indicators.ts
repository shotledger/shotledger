// Bilaga 8 club-intyg indicators computable from app data (SHB p. 484, see
// docs/reference/spsf-shb-2026.md "Licens/intyg"). Spec:
// m6-compliance-spec.md "Behaviors — indicators.ts".
import { goldSeriesCount, type StatsSeries } from '../scoring/stats';
import { subtractMonthsUtc, wholeMonthsBetween } from './months';

export interface MonthsOfActivityResult {
  /** Whole months from the earliest logged session to `now`. */
  months: number;
  firstSessionIso: string | null;
}

/**
 * SHB Bilaga 8 p. 484: "≥6 months aktivt medlemskap ... innan första
 * intyg" — approximated here by months since the earliest logged session,
 * not actual club membership (the app has no membership record).
 */
export function monthsOfLoggedActivity(
  sessions: readonly { startedAt: string }[],
  now: Date = new Date(),
): MonthsOfActivityResult {
  if (sessions.length === 0) return { months: 0, firstSessionIso: null };
  const firstSessionIso = sessions
    .map((s) => s.startedAt)
    .reduce((earliest, iso) => (iso < earliest ? iso : earliest));
  return { months: wholeMonthsBetween(firstSessionIso, now.toISOString()), firstSessionIso };
}

const MARKE_GULD_WINDOW_MONTHS = 24;

export interface MarkeGuldFulfillmentResult {
  /**
   * VERIFY: "fulfilled" here is a placeholder proxy — at least one guldserie
   * in the trailing 24 months. SHB Bilaga 1 (available in this repo) gives
   * only the per-series point threshold, not how many guld-series or which
   * match format earns the badge itself. Not a confirmed pass/fail.
   */
  fulfilled: boolean;
  goldSeriesCountLast24Months: number;
  windowStartIso: string;
  ruleVerified: false;
}

export interface MarkeGuldFulfillmentInput {
  seriesList: readonly StatsSeries[];
  birthYear?: number | null;
  now?: Date;
}

/**
 * Pistolskyttemärke guld fulfillment over the last two years, delegating the
 * per-series threshold to shared/scoring/marke.ts via goldSeriesCount —
 * never re-implements the threshold table.
 */
export function pistolskyttemarkeGuldFulfillment(
  input: MarkeGuldFulfillmentInput,
): MarkeGuldFulfillmentResult {
  const now = input.now ?? new Date();
  const windowStart = subtractMonthsUtc(now, MARKE_GULD_WINDOW_MONTHS);
  const windowStartIso = windowStart.toISOString();
  const nowIso = now.toISOString();

  const inWindow = input.seriesList.filter(
    (series) => series.startedAt >= windowStartIso && series.startedAt <= nowIso,
  );
  const count = goldSeriesCount(inWindow, { birthYear: input.birthYear });

  return {
    fulfilled: count >= 1,
    goldSeriesCountLast24Months: count,
    windowStartIso,
    ruleVerified: false,
  };
}
