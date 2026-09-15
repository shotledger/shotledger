// Which dark blob is the printed black zone.
//
// Stage 1 used to take the largest one by area, full stop. Measured on a
// second shooter's corpus (docs/specs/contributed-corpus-2026-09-15.md) that
// loses 12 of 68 photos: a landscape frame with a wooden post or a wall down
// one side hands "largest dark region" to the post, and the ellipse fitted to
// it is a sliver.
//
// A target face is a disc. Two cheap shape tests say so, and neither needs
// the ring structure: the fitted ellipse is not far off circular, and the
// contour actually fills that ellipse. A post fails the first; an L-shaped
// shadow joining two dark areas fails the second.
//
// Kept as a pure function over candidate descriptors so the rule is unit
// tested — the OpenCV call that produces the descriptors cannot run off-device.

/** One dark contour, described by what OpenCV already computed for it. */
export interface FaceCandidate {
  /** Index into the contour vector, returned as the pick. */
  index: number;
  /** `contourArea`, in px². */
  area: number;
  /** Fitted ellipse axes, in px. Major is the longer one. */
  majorAxis: number;
  minorAxis: number;
}

/**
 * Widest ellipse still accepted, as major/minor. A target face photographed
 * at the 24° worst case in the corpus is ~1.1; the validity gate rejects
 * anything past 2.0 later anyway, so accepting up to 2.0 here changes which
 * blob is chosen without changing which photos are allowed through.
 */
export const MAX_FACE_ASPECT = 2;

/**
 * Lowest share of its own fitted ellipse a candidate may fill. A disc sits
 * near 1.0; the sliver fitted to a post or a merged shadow sits well below.
 * 0.6 leaves room for a face whose edge is broken by a patch or a staple.
 */
export const MIN_FACE_FILL = 0.6;

/** Area of the fitted ellipse, px². */
function ellipseArea(candidate: FaceCandidate): number {
  return (Math.PI / 4) * candidate.majorAxis * candidate.minorAxis;
}

/** major/minor, guarding a degenerate fit where the minor axis rounds to 0. */
export function faceAspect(candidate: FaceCandidate): number {
  if (candidate.minorAxis <= 0) return Number.POSITIVE_INFINITY;
  return candidate.majorAxis / candidate.minorAxis;
}

/** How much of its fitted ellipse the contour fills, 0..~1. */
export function faceFill(candidate: FaceCandidate): number {
  const area = ellipseArea(candidate);
  if (area <= 0) return 0;
  return candidate.area / area;
}

/** Whether a candidate looks like a disc rather than a sliver or an L. */
export function isDiscLike(candidate: FaceCandidate): boolean {
  return faceAspect(candidate) <= MAX_FACE_ASPECT && faceFill(candidate) >= MIN_FACE_FILL;
}

/**
 * The largest disc-like candidate; the largest candidate of any shape when
 * none is disc-like.
 *
 * The fallback matters: it keeps this strictly no worse than picking by area.
 * A photo where every blob fails the shape tests still goes to stage 3 and
 * then to the validity gate, exactly as before, rather than being refused
 * here on a shape heuristic.
 */
export function pickFaceCandidate(candidates: readonly FaceCandidate[]): FaceCandidate | null {
  let best: FaceCandidate | null = null;
  let fallback: FaceCandidate | null = null;

  for (const candidate of candidates) {
    if (candidate.area <= 0) continue;
    if (!fallback || candidate.area > fallback.area) fallback = candidate;
    if (!isDiscLike(candidate)) continue;
    if (!best || candidate.area > best.area) best = candidate;
  }

  return best ?? fallback;
}
