// The geometry validity gate. Spec: docs/specs/photo-scoring-phase1-spec.md §2.
//
// The CV spike (docs/specs/cv-spike-report.md §6.3) found that the ring
// residual is NOT a validity check: two photos locked confidently onto sky
// and gravel behind the target and still reported plausible residuals,
// "because the profile search finds *some* edge near each nominal radius".
// This module is the separate "is this actually a target face" signal that
// finding demands.
//
// Pure arithmetic over numbers the native layer measures, so it is testable
// without OpenCV. Thresholds are calibrated on the real 38-photo corpus by
// spike/cv/validity_gate.py — see docs/specs/photo-scoring-phase1-evidence.md.

/** Raw measurements the native geometry stage supplies. */
export interface GeometryMetrics {
  /** Fitted black-zone ellipse majorAxis / minorAxis. */
  readonly axisRatio: number;
  /** Ellipse majorAxis / max(imageWidth, imageHeight). */
  readonly zoneFraction: number;
  /** Whether the fitted ellipse centre lies inside the image. */
  readonly centerInFrame: boolean;
  /** Mean grey of the annulus at 1.15-1.40r minus the disc at 0.70r. */
  readonly zoneContrastGrey: number;
  /** Stage-3 objective normalised by the radial profile's own MAD. */
  readonly profileScore: number;
}

export type ValidityReason =
  | 'axisRatio'
  | 'zoneFraction'
  | 'centerInFrame'
  | 'zoneContrast'
  | 'profileScore';

export interface ValidityResult {
  readonly valid: boolean;
  /** Every failing metric, in the declared order — the UI explains all of them. */
  readonly reasons: readonly ValidityReason[];
}

export const GEOMETRY_THRESHOLDS = {
  /** Beyond this the "black zone" is a treeline, a frame-edge sliver, or
   *  perspective past what weak-perspective rectification can undo. */
  maxAxisRatio: 2.0,
  /** Below: too small to be the subject. Above: the black zone fills the
   *  frame, so Otsu had no paper/black boundary to find. */
  minZoneFraction: 0.1,
  maxZoneFraction: 0.95,
  /** The decisive one: a precision face is a solid black disc on light card.
   *  Gravel, sky and a milsnabb annulus have no such step. The corpus
   *  separates with an empty gap from 17.7 to 84.2; 50 sits inside it. */
  minZoneContrastGrey: 50,
  /** A flat, structureless radial profile. Normalised, so this is an
   *  absolute threshold rather than a proxy for photo contrast. */
  minProfileScore: 20,
} as const;

/**
 * Every check is written as a NEGATED comparison so that a NaN metric fails
 * rather than comparing its way to `valid` — `NaN <= 2` is false, but
 * `!(NaN <= 2)` is true, which is the answer the gate needs.
 */
export function checkGeometryValidity(metrics: GeometryMetrics): ValidityResult {
  const t = GEOMETRY_THRESHOLDS;
  const reasons: ValidityReason[] = [];

  if (!(metrics.axisRatio <= t.maxAxisRatio)) reasons.push('axisRatio');
  if (!(metrics.zoneFraction >= t.minZoneFraction && metrics.zoneFraction <= t.maxZoneFraction)) {
    reasons.push('zoneFraction');
  }
  if (!metrics.centerInFrame) reasons.push('centerInFrame');
  if (!(metrics.zoneContrastGrey >= t.minZoneContrastGrey)) reasons.push('zoneContrast');
  if (!(metrics.profileScore >= t.minProfileScore)) reasons.push('profileScore');

  return { valid: reasons.length === 0, reasons };
}
