// Series celebration (#482): which tier a series has reached, and whether an
// edit should celebrate it.
import {
  MAX_VALUE_TENTHS,
  tenthsToScore,
  type EntryShot,
  type ScoringMode,
} from '@shotledger/shared';

/**
 * `fullScore`: every shot in the 10 ring (5×10 = 50). `perfect`: nothing left
 * to gain — every shot an inner ten in integer scoring, 10.9 in decimal (54.5).
 */
export type CelebrationTier = 'gold' | 'fullScore' | 'perfect';

/** Ring disciplines where a series is celebrated. */
const CELEBRATED_DISCIPLINES: ReadonlySet<string> = new Set([
  'spsf-precision',
  'spsf-magnumprecision',
  'spsf-milsnabb',
]);

const TEN_RING_TENTHS = 100;

const RANK: Record<CelebrationTier, number> = { gold: 1, fullScore: 2, perfect: 3 };

export function celebratesDiscipline(disciplineId: string | null | undefined): boolean {
  return disciplineId != null && CELEBRATED_DISCIPLINES.has(disciplineId);
}

export interface TierContext {
  mode: ScoringMode;
  seriesLength: number;
  /** Gold-series threshold in points, or null where the märke rule does not apply. */
  guldThreshold: number | null;
  isSighter: boolean;
}

function isPerfectShot(shot: EntryShot, mode: ScoringMode): boolean {
  return mode === 'decimal' ? shot.valueTenths === MAX_VALUE_TENTHS : shot.isInnerTen;
}

/** The tier a complete series has reached, or null. Any series length. */
export function celebrationTier(
  shots: readonly (EntryShot | null)[],
  { mode, seriesLength, guldThreshold, isSighter }: TierContext,
): CelebrationTier | null {
  const entered = shots.filter((shot): shot is EntryShot => shot !== null);
  if (entered.length !== seriesLength) return null;

  if (entered.every((shot) => isPerfectShot(shot, mode))) return 'perfect';
  if (entered.every((shot) => shot.valueTenths >= TEN_RING_TENTHS)) return 'fullScore';

  const totalTenths = entered.reduce((sum, shot) => sum + shot.valueTenths, 0);
  if (guldThreshold !== null && !isSighter && tenthsToScore(totalTenths) >= guldThreshold) {
    return 'gold';
  }
  return null;
}

/**
 * The tier to celebrate now, or null: only one above the highest already
 * reached on this visit, so reopening a 50 or re-entering a shot stays quiet.
 */
export function tierToCelebrate(
  highestSoFar: CelebrationTier | null,
  next: CelebrationTier | null,
): CelebrationTier | null {
  if (next === null) return null;
  if (highestSoFar !== null && RANK[next] <= RANK[highestSoFar]) return null;
  return next;
}
