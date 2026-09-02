// Bridges photo-marked holes into the existing entry/score model
// (shared/src/scoring/entry.ts's EntryShot: {valueTenths, isInnerTen}).
// Executable spec: docs/specs/target-scoring-math-spec.md §5.
//
// Photo scoring only ever produces integer-mode shots — a ring value has no
// decimal component to read from a hole position — so valueTenths = value *
// 10 exactly, no precision lost.

import type { EntryShot } from '../scoring/entry';
import type { Hole, ScoreResult } from './score';
import { scoreHole } from './score';
import type { TargetFaceDefinition } from './targets';

export function scoreResultToEntryShot(result: ScoreResult): EntryShot {
  return { valueTenths: result.value * 10, isInnerTen: result.isInnerTen };
}

export function scoreSeries(
  holes: readonly Hole[],
  target: TargetFaceDefinition,
): readonly ScoreResult[] {
  return holes.map((hole) => scoreHole(hole, target));
}

export function seriesToEntryShots(
  holes: readonly Hole[],
  target: TargetFaceDefinition,
): readonly EntryShot[] {
  return scoreSeries(holes, target).map(scoreResultToEntryShot);
}

/** True when any hole in the series is an edge call — the app should show
 * the judgement call to the user rather than silently trusting the score
 * (spike report §4.5/§5). */
export function seriesNeedsReview(results: readonly ScoreResult[]): boolean {
  return results.some((result) => result.edgeCall);
}
