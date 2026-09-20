// Turning a scored group into something worth saying.
//
// The advice is deliberately narrow. Two things are visible in the numbers
// and nothing else is: whether the group sits off-center, and how wide it is.
// `analyzePointsLost` already separates exactly those — the points a
// corrected point of aim would recover (position) from the points the
// group's own spread costs whatever you do (size) — so the hints read that
// split rather than inventing a new heuristic.
//
// What this must NOT do is diagnose technique. "You are jerking the trigger"
// is not in the data; a low-left group on a right-handed shooter is the
// classic reading, but the app does not know handedness, hold, sight picture
// or whether the sights were simply set wrong, and saying it anyway would be
// a guess dressed as analysis.
//
// Hints are returned as structured kinds, not prose: the app owns the
// wording in both languages, and a test can assert the reasoning without
// asserting a sentence.

import type { GroupAnalysis, PointsLostAnalysis } from './group';

export type CoachingHintKind =
  /** Too little to say anything about. */
  | 'sample'
  /** Most of the shortfall is recoverable by moving the point of impact. */
  | 'adjustSights'
  /** Most of the shortfall is the group's own spread. */
  | 'tightenGroup'
  /** Neither dominates — both would have to improve. */
  | 'balanced'
  /** The group is centered and tight; the shortfall is small. */
  | 'onTarget';

export interface CoachingHint {
  readonly kind: CoachingHintKind;
  /** Where the group sits, for the sight hint. Positive = right / up. */
  readonly windageMm?: number;
  readonly elevationMm?: number;
  /** Points the two causes account for, for the wording. */
  readonly pointsToPosition?: number;
  readonly pointsToSize?: number;
  readonly shotCount: number;
}

/**
 * Below this a group is noise: with a handful of shots the mean point of
 * impact moves several millimeters on one flier, and advice built on it
 * would change from series to series.
 */
export const MIN_SHOTS_FOR_COACHING = 10;

/**
 * How much one cause has to dominate before it is named alone. Below this
 * the two are close enough that picking one would be arbitrary.
 */
const DOMINANCE = 1.5;

/** Under this many points lost, there is nothing to fix worth saying. */
const NEGLIGIBLE_POINTS = 1;

export function coachingHint(
  group: GroupAnalysis | null,
  pointsLost: PointsLostAnalysis | null,
): CoachingHint | null {
  if (!group || !pointsLost) return null;

  const shotCount = group.shotCount;
  if (shotCount < MIN_SHOTS_FOR_COACHING) return { kind: 'sample', shotCount };

  // `pointsLostToPosition` can be negative when a flier drags the MPI away
  // from an otherwise tight cluster (group.ts §9.1) — recentring would then
  // score *worse*, so there is nothing to recover by moving the sights.
  const toPosition = Math.max(0, pointsLost.pointsLostToPosition);
  const toSize = pointsLost.pointsLostToSize;

  const base = {
    shotCount,
    windageMm: group.windageMm,
    elevationMm: group.elevationMm,
    pointsToPosition: toPosition,
    pointsToSize: toSize,
  };

  if (toPosition + toSize < NEGLIGIBLE_POINTS) return { kind: 'onTarget', ...base };
  if (toPosition > toSize * DOMINANCE) return { kind: 'adjustSights', ...base };
  if (toSize > toPosition * DOMINANCE) return { kind: 'tightenGroup', ...base };
  return { kind: 'balanced', ...base };
}
