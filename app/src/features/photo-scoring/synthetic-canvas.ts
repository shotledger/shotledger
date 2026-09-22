// A synthetic rectified canvas, drawn with integer arithmetic only, so it
// reproduces `spike/cv/synthetic_canvas.py` pixel for pixel. Test support for
// the hole-proposal lock-step fixture; no real photo is involved (hard rule 7).
//
// Every shape is a squared-distance or rectangle test on integer coordinates;
// the paper grain and the torn rims come from a 32-bit hash of (x, y, seed).
// Keep both implementations in lock-step.

export function hash32(x: number, y: number, seed: number): number {
  let h = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ seed) >>> 0) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h;
}

export interface SyntheticCanvasOptions {
  readonly seed: number;
  readonly size: number;
  /** Hole centres, px. */
  readonly holes: readonly (readonly [number, number])[];
  /** Patch centres, px. */
  readonly patches: readonly (readonly [number, number])[];
  /** Radius of the black disc, px. */
  readonly blackR: number;
  /** Ring radii, px. */
  readonly rings: readonly number[];
  /** L1 radius of the diamond outside which the canvas is white padding, px. */
  readonly pad: number;
}

export function syntheticCanvas(o: SyntheticCanvasOptions): Uint8Array {
  const { size, seed } = o;
  const c = Math.floor(size / 2);
  const out = new Uint8Array(size * size);
  // Flat number arrays and indexed loops: Babel lowers `for..of` with
  // destructuring to iterator helpers, which is a 100x slowdown per pixel.
  const rings = Array.from(o.rings);
  const bars: number[] = [];
  for (const rr of rings) bars.push(c + rr - 8, c, c - rr + 8, c, c, c + rr - 8, c, c - rr + 8);
  const patches: number[] = [];
  for (const p of o.patches) patches.push(p[0], p[1]);
  const holes: number[] = [];
  for (const hh of o.holes) holes.push(hh[0], hh[1]);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - c;
      const dy = y - c;
      const r2 = dx * dx + dy * dy;
      const inBlack = r2 <= o.blackR * o.blackR;
      let v = inBlack ? 40 : 225;
      // ring lines: a 1 px band (|r - rr| <= 0.5), fainter than a hole
      for (let i = 0; i < rings.length; i += 1) {
        const rr = rings[i] as number;
        if ((2 * rr - 1) * (2 * rr - 1) <= 4 * r2 && 4 * r2 <= (2 * rr + 1) * (2 * rr + 1)) {
          v = inBlack ? 140 : 120;
        }
      }
      // bar "digits": diagonal bars ~17 px long, 6 px inside each ring, at
      // four positions. Diagonal, like the patches and the padding edge below,
      // because an edge that is exactly vertical leaves float32 rounding
      // residues in OpenCV's Sobel that pick orientation bins arbitrarily —
      // real photos have no exact edges, this art must not.
      for (let i = 0; i < bars.length; i += 2) {
        const ex = x - (bars[i] as number);
        const ey = y - (bars[i + 1] as number);
        if (Math.abs(ex + ey) <= 2 && Math.abs(ex - ey) <= 12) v = inBlack ? 220 : 50;
      }
      // patches: flat diamonds, 14 px from centre to tip
      for (let i = 0; i < patches.length; i += 2) {
        if (Math.abs(x - (patches[i] as number)) + Math.abs(y - (patches[i + 1] as number)) <= 14) {
          v = inBlack ? 55 : 215;
        }
      }
      // holes: a core, a rim, and a jagged fringe decided by the hash
      for (let i = 0; i < holes.length; i += 2) {
        const ex = x - (holes[i] as number);
        const ey = y - (holes[i + 1] as number);
        const e2 = ex * ex + ey * ey;
        if (e2 <= 81) v = inBlack ? 190 : 90;
        else if (e2 <= 144) v = inBlack ? 215 : 60;
        else if (e2 <= 225 && hash32(x, y, seed + 7) % 3 === 0) v = inBlack ? 215 : 60;
      }
      // grain: -3..+3
      v += (hash32(x, y, seed) % 7) - 3;
      // padding: everything outside a diamond of L1 radius `pad`, so the
      // padding edge is diagonal and its corners touch the border
      if (Math.abs(dx) + Math.abs(dy) > o.pad) v = 255;
      out[y * size + x] = Math.min(255, Math.max(0, v));
    }
  }
  return out;
}
