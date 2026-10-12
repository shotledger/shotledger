import { tenthsToScore } from '@shotledger/shared/src/scoring/totals';

/**
 * A summed score: whole points unless a decimal-scored shot left a fraction
 * ("301", "301.4"). A mean keeps its decimal; a sum of integers has none.
 */
export function formatTotalScore(tenths: number | null, empty = '–'): string {
  if (tenths === null) return empty;
  return tenths % 10 === 0 ? String(tenthsToScore(tenths)) : tenthsToScore(tenths).toFixed(1);
}
