// Tap-to-mark interaction state, as a pure reducer so the rules are testable
// without a renderer. Spec: docs/specs/photo-scoring-phase1-spec.md §6.
//
// Scoring itself is not reimplemented here: `scoreHole` from
// shared/src/target-scoring owns the SHB F.6.10.1 edge rule. This module owns
// what the user did — where they tapped, which mark is selected, which X they
// called, and which side of an edge call they chose.
import type { ScoreResult, TargetFaceDefinition } from '@shotledger/shared';
import { scoreHole } from '@shotledger/shared';

export interface Mark {
  readonly id: string;
  /** Target-mm, origin at the target center, y increasing DOWNWARD. */
  readonly xMm: number;
  readonly yMm: number;
  readonly caliberMm: number;
  /** Centrumtia. A tap cannot know this — it is the shooter's own call. */
  readonly isInnerTen: boolean;
  /**
   * The user's answer to an edge call: the ring label they chose, or null to
   * accept what the geometry computed. Kept as the *label* rather than a
   * boolean so that moving the mark afterwards invalidates it naturally.
   */
  readonly calledRingLabel: string | null;
  /**
   * The shooter nudged this mark after placing it.
   *
   * Carried for the opt-in training store (db/queries/training-samples.ts),
   * where it is the most valuable bit in the row: a moved mark is a label
   * that also records that the first placement was wrong. Nothing in scoring
   * reads it.
   */
  readonly moved: boolean;
}

export interface MarkState {
  readonly marks: readonly Mark[];
  readonly selectedId: string | null;
  /** Series length from the program — further taps are refused, not ignored. */
  readonly maxMarks: number;
  /** The disc diameter new marks get. */
  readonly caliberMm: number;
}

export function createMarkState(options: {
  maxMarks: number;
  caliberMm: number;
  marks?: readonly Mark[];
}): MarkState {
  return {
    marks: options.marks ?? [],
    selectedId: null,
    maxMarks: options.maxMarks,
    caliberMm: options.caliberMm,
  };
}

export type MarkAction =
  | { type: 'tap'; id: string; xMm: number; yMm: number }
  | { type: 'select'; id: string }
  | { type: 'deselect' }
  | { type: 'move'; xMm: number; yMm: number }
  | { type: 'delete' }
  | { type: 'toggleInnerTen' }
  | { type: 'callRing'; ringLabel: string | null }
  | { type: 'setCaliber'; caliberMm: number }
  | { type: 'clear' };

export const MARK_LIMIT_REACHED = 'markLimitReached' as const;

function replaceSelected(state: MarkState, patch: (mark: Mark) => Mark): MarkState {
  if (!state.selectedId) return state;
  return {
    ...state,
    marks: state.marks.map((m) => (m.id === state.selectedId ? patch(m) : m)),
  };
}

export function markReducer(state: MarkState, action: MarkAction): MarkState {
  switch (action.type) {
    case 'tap': {
      if (state.marks.length >= state.maxMarks) return state;
      const mark: Mark = {
        id: action.id,
        xMm: action.xMm,
        yMm: action.yMm,
        caliberMm: state.caliberMm,
        isInnerTen: false,
        calledRingLabel: null,
        moved: false,
      };
      // A new mark is selected, so Move/Delete is one tap away — the
      // benchmark's behavior.
      return { ...state, marks: [...state.marks, mark], selectedId: mark.id };
    }
    case 'select':
      return state.marks.some((m) => m.id === action.id)
        ? { ...state, selectedId: action.id }
        : state;
    case 'deselect':
      return { ...state, selectedId: null };
    case 'move':
      // Moving invalidates any edge call: the two candidates were computed
      // for the old position and may not even be the same two rings.
      return replaceSelected(state, (m) => ({
        ...m,
        xMm: action.xMm,
        yMm: action.yMm,
        calledRingLabel: null,
        moved: true,
      }));
    case 'delete':
      if (!state.selectedId) return state;
      return {
        ...state,
        marks: state.marks.filter((m) => m.id !== state.selectedId),
        selectedId: null,
      };
    case 'toggleInnerTen':
      return replaceSelected(state, (m) => ({ ...m, isInnerTen: !m.isInnerTen }));
    case 'callRing':
      return replaceSelected(state, (m) => ({ ...m, calledRingLabel: action.ringLabel }));
    case 'setCaliber':
      // Changing the caliber re-sizes every existing disc, because the disc
      // is what the edge rule measures from — leaving old marks at the old
      // diameter would silently mix two scoring bases in one series.
      return {
        ...state,
        caliberMm: action.caliberMm,
        marks: state.marks.map((m) => ({
          ...m,
          caliberMm: action.caliberMm,
          calledRingLabel: null,
        })),
      };
    case 'clear':
      return { ...state, marks: [], selectedId: null };
  }
}

export function canAddMark(state: MarkState): boolean {
  return state.marks.length < state.maxMarks;
}

export interface RingCandidate {
  readonly label: string;
  readonly value: number;
  readonly isInnerTen: boolean;
}

export interface MarkScore {
  readonly markId: string;
  /** What the geometry computed, before any user call. */
  readonly computed: ScoreResult;
  /**
   * The two values in play when `computed.edgeCall` is set, higher first.
   * Empty when this is not an edge call.
   */
  readonly candidates: readonly RingCandidate[];
  /** The value in force — the user's call when they made one. */
  readonly effective: RingCandidate;
  /** Whether the user overrode the computed value. */
  readonly called: boolean;
}

/**
 * The edge rule sends a hole to the higher value as soon as it tangents the
 * ring. Within 1 mm of that boundary the call is genuinely arguable, so the
 * two candidates are the ring it scored and the next ring outward — exactly
 * the pair the shooter and a scorer would be arguing about.
 */
function candidatesFor(computed: ScoreResult, target: TargetFaceDefinition): RingCandidate[] {
  if (!computed.edgeCall) return [];
  const index = target.rings.findIndex((r) => r.label === computed.ringLabel);
  const higher = target.rings[index];
  const lower = target.rings[index + 1];
  if (!higher) return [];
  const pair: RingCandidate[] = [
    { label: higher.label, value: higher.value, isInnerTen: higher.isInnerTen },
  ];
  if (lower) {
    pair.push({ label: lower.label, value: lower.value, isInnerTen: lower.isInnerTen });
  }
  return pair;
}

export function scoreMarks(
  marks: readonly Mark[],
  target: TargetFaceDefinition,
): readonly MarkScore[] {
  return marks.map((mark) => {
    const computed = scoreHole(
      { centerMm: { x: mark.xMm, y: mark.yMm }, caliberMm: mark.caliberMm },
      target,
    );
    const candidates = candidatesFor(computed, target);
    const called = candidates.find((c) => c.label === mark.calledRingLabel);
    const effective: RingCandidate = called ?? {
      label: computed.ringLabel,
      value: computed.value,
      isInnerTen: computed.isInnerTen,
    };
    return { markId: mark.id, computed, candidates, effective, called: Boolean(called) };
  });
}

export interface SeriesScoreLine {
  /** Sum of the effective ring values. */
  readonly total: number;
  /** X count — the shooter's calls only, never inferred from a tap. */
  readonly innerTenCount: number;
  /** Per-shot values, sorted descending, as the benchmark shows them. */
  readonly shotValues: readonly number[];
}

export function seriesScoreLine(
  marks: readonly Mark[],
  scores: readonly MarkScore[],
): SeriesScoreLine {
  const values = scores.map((s) => s.effective.value);
  return {
    total: values.reduce((sum, v) => sum + v, 0),
    innerTenCount: marks.filter((m) => m.isInnerTen).length,
    shotValues: [...values].sort((a, b) => b - a),
  };
}

/** The rows `saveSeriesMarks` persists, in the order the user placed them. */
export function marksToShotMarkInputs(
  marks: readonly Mark[],
  scores: readonly MarkScore[],
): { xMm: number; yMm: number; caliberMm: number; valueTenths: number; isInnerTen: boolean }[] {
  return marks.map((mark, index) => {
    // `scores` is built from `marks`, so the index is always in range.
    const score = scores[index] as MarkScore;
    return {
      xMm: mark.xMm,
      yMm: mark.yMm,
      caliberMm: mark.caliberMm,
      // Photo scoring is integer-mode only: a ring value has no decimal
      // component to read from a hole position.
      valueTenths: score.effective.value * 10,
      isInnerTen: mark.isInnerTen,
    };
  });
}
