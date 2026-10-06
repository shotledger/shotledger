// Three checks that refuse a precision close-up lock on a milsnabb photo, where
// a crop of milsnabb's X and 10 rings reads line for line as precision's at
// twice the size, and the X-line check that asks the shooter about the crops
// they miss (docs/specs/cv-closeup-lock-2026-09.md, last sections).
import type { TargetFaceDefinition } from '@shotledger/shared';

import type { XRingReading } from './closeup-lock';
import type { Homography } from './corners';

import {
  type HoleCandidate,
  HOLE_PROPOSAL_THRESHOLD,
  MERGE_RADIUS_D,
  type ProposalFace,
} from './hole-proposals';
import { type MilsnabbLock, passesMilsnabbGate } from './milsnabb-lock';
import type { RectifiedCanvas } from './tap-snap';

/** Why a precision close-up lock was refused. */
export type PrecisionGuardRefusal = 'milsnabbLock' | 'perspective' | 'holeSize';

/** The range the mapping's projective denominator may span over the photo,
 *  relative to its value at the target centre. */
export const PERSPECTIVE_GUARD = { min: 0.5, max: 2 } as const;

export const HOLE_SIZE_GUARD = {
  /** Only holes the proposals would suggest are read. */
  minProbability: HOLE_PROPOSAL_THRESHOLD,
  /** A median below this share of the calibre, read at half the calibre,
   *  is a lock twice too large. */
  maxShare: 0.5,
} as const;

/** What the hole proposals read on a face, for the calibre given. */
export function proposalFaceOf(face: TargetFaceDefinition, caliberMm: number): ProposalFace {
  const radii = face.rings.map((ring) => ring.diameterMm / 2);
  return {
    caliberMm,
    blackRadiusMm: face.referenceDiameterMm / 2,
    maxRadiusMm: Math.max(...radii),
    ringRadiiMm: radii,
  };
}

/**
 * The diameters (mm) of the holes the proposals find through the lock at the
 * calibre given, best first, one per hole. A hole's diameter is its blob's
 * area as a disc's: the probabilities saturate, the blob does not. A
 * candidate with no blob under its peak is skipped.
 */
export function holeDiametersMm(
  canvas: RectifiedCanvas,
  face: ProposalFace,
  candidatesOf: (canvas: RectifiedCanvas, face: ProposalFace) => readonly HoleCandidate[],
): number[] {
  const d = face.caliberMm * canvas.pxPerMm;
  const kept: HoleCandidate[] = [];
  for (const c of candidatesOf(canvas, face)
    .filter((c) => c.probability >= HOLE_SIZE_GUARD.minProbability && c.features.b_area > 0)
    .sort((a, b) => b.probability - a.probability)) {
    if (kept.some((k) => Math.hypot(c.x - k.x, c.y - k.y) < MERGE_RADIUS_D * d)) continue;
    kept.push(c);
  }
  return kept.map((c) => face.caliberMm * Math.sqrt(c.features.b_area));
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/**
 * True when the holes read too small for the calibre: a lock twice too large.
 * `fullMm` are the holes read at the calibre, `halfMm` at half of it, where a
 * hole through such a lock is the size the proposals look for. Any hole read
 * at the calibre (paper texture at half of it comes with some), or none at
 * all, abstains.
 */
export function holesTooSmall(
  fullMm: readonly number[],
  halfMm: readonly number[],
  caliberMm: number,
): boolean {
  if (fullMm.length > 0) return false;
  if (halfMm.length === 0) return false;
  return median(halfMm) < HOLE_SIZE_GUARD.maxShare * caliberMm;
}

/**
 * The perspective guard: true when the lock's projective denominator at a
 * corner of the photo is outside PERSPECTIVE_GUARD of its value at the target
 * centre, or changes sign there (the horizon crosses the photo). No hand-held
 * photo of a flat target is that oblique; a lock on the wrong rings can be.
 */
export function perspectiveRefuses(
  toMm: Homography,
  center: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
): boolean {
  const w = (x: number, y: number) => toMm[6] * x + toMm[7] * y + toMm[8];
  const atCenter = w(center.x, center.y);
  if (!(Math.abs(atCenter) > 0)) return true;
  for (const x of [0, size.width]) {
    for (const y of [0, size.height]) {
      const ratio = w(x, y) / atCenter;
      if (!(ratio >= PERSPECTIVE_GUARD.min && ratio <= PERSPECTIVE_GUARD.max)) return true;
    }
  }
  return false;
}

/** The milsnabb guard: the milsnabb lock passing on the same photo. */
export function milsnabbLockRefuses(milsnabb: MilsnabbLock | null): boolean {
  return passesMilsnabbGate(milsnabb);
}

/** The X line counts as missing below both shares (#526's median reading). */
export const X_LINE_PROMPT = { maxOfTen: 0.15, maxOfGaps: 1.5 } as const;

/**
 * True when no X ring line is printed where the close-up lock puts it, as on a
 * milsnabb crop of its X and 10. Paster-covered precision centres read the
 * same, so this asks the shooter rather than refuses. Abstains on null.
 */
export function xLineMissing(reading: XRingReading | null): boolean {
  if (!reading) return false;
  return (
    reading.x < X_LINE_PROMPT.maxOfTen * reading.ten &&
    reading.x < X_LINE_PROMPT.maxOfGaps * reading.gap
  );
}

/** The shooter's answer to "Precision or milsnabb face?". */
export type FaceAnswer = 'precision' | 'milsnabb';

/**
 * What a precision close-up lock that passed the guards does next: go on as
 * precision, refuse it as milsnabb, or ask. Asks only when the X line is
 * missing and the session has no answer yet.
 */
export function faceDecision(
  missing: boolean,
  remembered: FaceAnswer | undefined,
): FaceAnswer | 'ask' {
  if (!missing) return 'precision';
  return remembered ?? 'ask';
}
