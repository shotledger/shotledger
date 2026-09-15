// Snapping a tap to the hole under the finger.
//
// A tap is blind: the fingertip covers the hole it is aiming at, so the
// placement carries the shooter's intent but not their precision. The hole is
// usually within a millimetre or two of where they touched, and the rectified
// canvas already knows where it is.
//
// Pure JS on purpose. `runGeometry` hands out the rectified grey canvas once
// (`RectifiedCanvas`), so this runs on a typed array with no OpenCV call at
// tap time — which also means the rule is unit-testable off-device, where
// react-native-fast-opencv cannot run at all.
//
// The failure mode is deliberate: when nothing convincing is found, return
// null and keep the raw tap. The shooter's finger is the fallback, and a
// snap that jumps to the wrong blob is worse than no snap.
//
// Known limits, both inherited from working on a small window:
//
// - A repair patch only slightly larger than a hole can pass the gate, because
//   the crop that judges it then straddles the patch's own edge and reads the
//   boundary as variance. Club patches are several times a .22 hole, so this
//   is mostly theoretical — but it is the failure mode to expect.
// - A window filled almost entirely by holes has no background left for the
//   median to find, so nothing looks like a deviation. That is a tight group
//   at high magnification; the tap survives untouched, which is the right
//   answer there anyway.

/** The rectified grey canvas, as `runGeometry` emits it. */
export interface RectifiedCanvas {
  /** Row-major grey bytes, `size * size` of them. */
  readonly data: Uint8Array;
  readonly size: number;
  /** Where target-mm (0, 0) sits on this canvas. */
  readonly centreXPx: number;
  readonly centreYPx: number;
  readonly pxPerMm: number;
}

export interface SnapResult {
  readonly xMm: number;
  readonly yMm: number;
  /** How far the snap moved the tap, mm — useful for a "snapped" hint. */
  readonly distanceMm: number;
  /** The accepted candidate's local std-dev, the hole/patch discriminator. */
  readonly localStdDev: number;
}

/**
 * How far from the tap to look. 4 mm is about a fingertip's own error on a
 * 25 m precision face, and small enough that the window cannot reach the next
 * hole in a tight group (.22 holes are ~5.6 mm apart at best).
 */
export const SNAP_WINDOW_MM = 4;

/**
 * **These three are not fitted to the corpus.** They are conservative
 * starting values chosen so that the failure mode is "no snap":
 *
 * - `MIN_LOCAL_STD_DEV` is the hole/patch gate. Local std-dev is the single
 *   best classical discriminator measured — AUC 0.943 in
 *   `docs/specs/cv-corpus-validation-2026-09.md` — because a patch is flat
 *   (uniform fill, manufactured edges) while a hole has a bright torn-paper
 *   rim against dark ink. The AUC is measured; **this threshold is not**, and
 *   fitting it against that doc's 231 labelled holes and 351 non-holes is the
 *   obvious follow-up.
 * - `DEVIATION_FRACTION` and `MIN_CONTRAST` decide which pixels form a blob
 *   at all, and whether the window has any contrast worth searching.
 * - `AREA_TOLERANCE` bounds a candidate's area against the area a hole of the
 *   current calibre would have.
 */
export const MIN_LOCAL_STD_DEV = 12;
/**
 * A pixel joins a blob when it deviates from the local background by this
 * share of the window's strongest deviation. A fraction of the observed
 * maximum rather than a multiple of the window's standard deviation: a window
 * that a hole fills a third of is strongly bimodal, and a 1.5σ cut there
 * selects only the bright rim — which then has no internal variance left to
 * measure, because it was selected for being uniform.
 */
export const DEVIATION_FRACTION = 0.25;
/** Below this, the window is blank paper or flat ink and there is nothing to snap to. */
export const MIN_CONTRAST = 25;
export const AREA_TOLERANCE = { min: 0.25, max: 4 } as const;

interface Blob {
  /** Centroid, canvas px. */
  readonly xPx: number;
  readonly yPx: number;
  readonly areaPx: number;
}

interface Window {
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly height: number;
}

function windowAround(canvas: RectifiedCanvas, xPx: number, yPx: number, radiusPx: number): Window {
  const x0 = Math.max(0, Math.floor(xPx - radiusPx));
  const y0 = Math.max(0, Math.floor(yPx - radiusPx));
  const x1 = Math.min(canvas.size - 1, Math.ceil(xPx + radiusPx));
  const y1 = Math.min(canvas.size - 1, Math.ceil(yPx + radiusPx));
  return { x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * The window's background level and how far the strongest pixel departs from
 * it.
 *
 * Median, not mean: a hole (or two) inside the window drags a mean towards
 * itself, while the median stays on the paper or ink that surrounds it — which
 * is what "background" has to mean for the deviation test below.
 */
function windowStats(
  canvas: RectifiedCanvas,
  win: Window,
): { readonly background: number; readonly maxDeviation: number } {
  const count = win.width * win.height;
  if (count <= 0) return { background: 0, maxDeviation: 0 };

  const values = new Uint8Array(count);
  for (let y = 0; y < win.height; y += 1) {
    const row = (win.y0 + y) * canvas.size;
    for (let x = 0; x < win.width; x += 1) {
      values[y * win.width + x] = canvas.data[row + win.x0 + x] ?? 0;
    }
  }

  const sorted = Uint8Array.prototype.slice.call(values).sort();
  const background = sorted[Math.floor(count / 2)] ?? 0;

  let maxDeviation = 0;
  for (let i = 0; i < count; i += 1) {
    const deviation = Math.abs((values[i] ?? 0) - background);
    if (deviation > maxDeviation) maxDeviation = deviation;
  }
  return { background, maxDeviation };
}

/**
 * Local std-dev over a hole-sized crop centred on a point.
 *
 * This is the classifier, and it is deliberately *not* the variance of the
 * pixels a blob is made of: those were selected for deviating together, so
 * their own variance tends to zero — a hole's bright rim measured 0.0 that
 * way. Measured over the crop instead, a hole is high (bright torn rim, darker
 * core, ink around it) and a patch is low (flat fill), which is the mechanism
 * behind the 0.943 AUC in cv-corpus-validation-2026-09.md.
 */
function localStdDevAt(
  canvas: RectifiedCanvas,
  xPx: number,
  yPx: number,
  radiusPx: number,
): number {
  const win = windowAround(canvas, xPx, yPx, radiusPx);
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 0; y < win.height; y += 1) {
    const row = (win.y0 + y) * canvas.size;
    for (let x = 0; x < win.width; x += 1) {
      const value = canvas.data[row + win.x0 + x] ?? 0;
      sum += value;
      sumSq += value * value;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return Math.sqrt(Math.max(0, sumSq / count - mean * mean));
}

/**
 * Connected blobs of pixels that deviate from the local background, in either
 * direction.
 *
 * Both directions matter, and this is the part a "find the darkest blob" rule
 * gets wrong: inside the black aiming zone a hole shows as a *bright* torn
 * rim against the ink, while out on the white paper the same hole is *dark*.
 * Deviation from the local background covers both without knowing which zone
 * the tap landed in.
 */
function findBlobs(
  canvas: RectifiedCanvas,
  win: Window,
  background: number,
  maxDeviation: number,
): Blob[] {
  const threshold = Math.max(1, DEVIATION_FRACTION * maxDeviation);
  const count = win.width * win.height;
  const deviant = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const x = win.x0 + (i % win.width);
    const y = win.y0 + Math.floor(i / win.width);
    const value = canvas.data[y * canvas.size + x] ?? 0;
    deviant[i] = Math.abs(value - background) >= threshold ? 1 : 0;
  }

  const blobs: Blob[] = [];
  const seen = new Uint8Array(count);
  const stack: number[] = [];

  for (let start = 0; start < count; start += 1) {
    if (seen[start] || !deviant[start]) continue;
    stack.push(start);
    seen[start] = 1;

    let sumX = 0;
    let sumY = 0;
    let area = 0;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const lx = index % win.width;
      const ly = Math.floor(index / win.width);

      area += 1;
      sumX += lx;
      sumY += ly;

      // 4-neighbourhood: a diagonal-only link is more likely two blobs
      // touching at a corner than one hole.
      const neighbours = [
        lx > 0 ? index - 1 : -1,
        lx < win.width - 1 ? index + 1 : -1,
        ly > 0 ? index - win.width : -1,
        ly < win.height - 1 ? index + win.width : -1,
      ];
      for (const n of neighbours) {
        if (n < 0 || seen[n] || !deviant[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }

    blobs.push({
      xPx: win.x0 + sumX / area,
      yPx: win.y0 + sumY / area,
      areaPx: area,
    });
  }

  return blobs;
}

export interface SnapOptions {
  /** Hole diameter to expect, mm — the calibre the shooter selected. */
  readonly caliberMm: number;
  readonly windowMm?: number;
}

/**
 * The hole nearest the tap, or null to keep the tap.
 *
 * Nearest rather than darkest or largest: the tap is the shooter's stated
 * intent, so among equally hole-like candidates the closest one is the one
 * they meant. Only shape and contrast decide whether a candidate is a hole at
 * all.
 */
export function snapToHole(
  canvas: RectifiedCanvas,
  tap: { readonly xMm: number; readonly yMm: number },
  options: SnapOptions,
): SnapResult | null {
  if (canvas.size <= 0 || canvas.pxPerMm <= 0) return null;
  if (canvas.data.length < canvas.size * canvas.size) return null;

  const windowMm = options.windowMm ?? SNAP_WINDOW_MM;
  const tapXPx = canvas.centreXPx + tap.xMm * canvas.pxPerMm;
  const tapYPx = canvas.centreYPx + tap.yMm * canvas.pxPerMm;
  const radiusPx = windowMm * canvas.pxPerMm;

  const win = windowAround(canvas, tapXPx, tapYPx, radiusPx);
  if (win.width < 3 || win.height < 3) return null;

  const { background, maxDeviation } = windowStats(canvas, win);
  // Blank paper, flat ink, or a blown-out highlight: nothing here departs far
  // enough from its surroundings to be a hole.
  if (maxDeviation < MIN_CONTRAST) return null;

  const expectedAreaPx =
    (Math.PI / 4) * Math.pow(options.caliberMm * canvas.pxPerMm, 2) || Number.POSITIVE_INFINITY;

  // 0.8 of the hole's radius: the crop has to sit *inside* the feature it is
  // judging. A crop the full size of a hole straddles the boundary of
  // anything hole-sized, and then even a flat patch reads as variance —
  // measured at 27 against a gate of 12 while getting this wrong.
  const cropRadiusPx = (options.caliberMm * canvas.pxPerMm * 0.8) / 2;
  let best: { blob: Blob; distancePx: number; localStdDev: number } | null = null;
  for (const blob of findBlobs(canvas, win, background, maxDeviation)) {
    if (blob.areaPx < expectedAreaPx * AREA_TOLERANCE.min) continue;
    if (blob.areaPx > expectedAreaPx * AREA_TOLERANCE.max) continue;

    const dx = blob.xPx - tapXPx;
    const dy = blob.yPx - tapYPx;
    const distancePx = Math.sqrt(dx * dx + dy * dy);
    if (distancePx > radiusPx) continue;

    const localStdDev = localStdDevAt(canvas, blob.xPx, blob.yPx, cropRadiusPx);
    if (localStdDev < MIN_LOCAL_STD_DEV) continue;

    if (!best || distancePx < best.distancePx) best = { blob, distancePx, localStdDev };
  }

  if (!best) return null;
  return {
    xMm: (best.blob.xPx - canvas.centreXPx) / canvas.pxPerMm,
    yMm: (best.blob.yPx - canvas.centreYPx) / canvas.pxPerMm,
    distanceMm: best.distancePx / canvas.pxPerMm,
    localStdDev: best.localStdDev,
  };
}
