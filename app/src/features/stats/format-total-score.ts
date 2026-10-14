import { tenthsToScore } from '@shotledger/shared/src/scoring/totals';

export interface FormatTotalScoreOptions {
  /**
   * The session's scoring mode, when the caller knows it. A decimal-scored
   * session always prints one decimal ("415.0"), as decimal results are
   * written; without a mode the value decides.
   */
  mode?: 'integer' | 'decimal';
  /** Shown for `null`. */
  empty?: string;
}

/**
 * A summed score — a session, series or best-of total: whole points unless
 * decimal scoring is in play ("301", "301.4"). With no mode, a value with no
 * fraction prints as a whole number, which is what the session screen does
 * for any total. A mean is not a sum and keeps its decimal; do not use this
 * for one.
 */
export function formatTotalScore(
  tenths: number | null,
  { mode, empty = '–' }: FormatTotalScoreOptions = {},
): string {
  if (tenths === null) return empty;
  if (mode === 'decimal' || tenths % 10 !== 0) return tenthsToScore(tenths).toFixed(1);
  return String(tenthsToScore(tenths));
}
