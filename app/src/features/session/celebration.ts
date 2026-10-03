// Perfect-series celebration (#482): which tier a series has reached, and
// whether an edit should celebrate it.
import { tenthsToScore, type EntryShot } from '@shotledger/shared';

export type CelebrationTier = 'gold' | 'perfect' | 'perfectInner';

/** Ring disciplines where a perfect series is celebrated. */
const CELEBRATED_DISCIPLINES: ReadonlySet<string> = new Set([
  'spsf-precision',
  'spsf-magnumprecision',
  'spsf-milsnabb',
]);

const TEN_RING_TENTHS = 100;

const RANK: Record<CelebrationTier, number> = { gold: 1, perfect: 2, perfectInner: 3 };

export function celebratesDiscipline(disciplineId: string | null | undefined): boolean {
  return disciplineId != null && CELEBRATED_DISCIPLINES.has(disciplineId);
}

export interface TierContext {
  seriesLength: number;
  /** Gold-series threshold in points, or null where the märke rule does not apply. */
  guldThreshold: number | null;
  isSighter: boolean;
}

/**
 * The tier a series has reached, or null. Perfect means complete with every
 * shot in the 10 ring — any series length, integer or decimal.
 */
export function celebrationTier(
  shots: readonly (EntryShot | null)[],
  { seriesLength, guldThreshold, isSighter }: TierContext,
): CelebrationTier | null {
  const entered = shots.filter((shot): shot is EntryShot => shot !== null);
  if (entered.length !== seriesLength) return null;

  if (entered.every((shot) => shot.valueTenths >= TEN_RING_TENTHS)) {
    return entered.every((shot) => shot.isInnerTen) ? 'perfectInner' : 'perfect';
  }

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

export function isPerfectTier(tier: CelebrationTier | null): tier is 'perfect' | 'perfectInner' {
  return tier === 'perfect' || tier === 'perfectInner';
}

// The series saved as perfect on the entry screen, so session detail stamps
// it in once on return instead of every time the row renders.
let pendingStampSeriesId: string | null = null;

export function markStampPending(seriesId: string): void {
  pendingStampSeriesId = seriesId;
}

/** The series marked by `markStampPending`, once; null after that. */
export function takePendingStamp(): string | null {
  const seriesId = pendingStampSeriesId;
  pendingStampSeriesId = null;
  return seriesId;
}
