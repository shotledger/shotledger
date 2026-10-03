// Two checks that refuse a precision close-up lock on a milsnabb photo, where
// a crop of milsnabb's X and 10 rings reads line for line as precision's at
// twice the size (docs/specs/cv-closeup-lock-2026-09.md, last section).
import type { TargetFaceDefinition } from '@shotledger/shared';

import {
  type HoleCandidate,
  HOLE_PROPOSAL_THRESHOLD,
  MERGE_RADIUS_D,
  type ProposalFace,
} from './hole-proposals';
import { type MilsnabbLock, passesMilsnabbGate } from './milsnabb-lock';
import type { RectifiedCanvas } from './tap-snap';

/** Why a precision close-up lock was refused. */
export type PrecisionGuardRefusal = 'milsnabbLock' | 'holeSize';

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

/** The milsnabb guard: the milsnabb lock passing on the same photo. */
export function milsnabbLockRefuses(milsnabb: MilsnabbLock | null): boolean {
  return passesMilsnabbGate(milsnabb);
}
