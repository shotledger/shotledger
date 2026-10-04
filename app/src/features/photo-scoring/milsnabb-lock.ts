// Close-up lock for the milsnabb face (SHB J.7.1, snabbskjutningstavla): the
// sibling of `closeup-lock.ts`, whose centre vote, polar ridge, ellipse and
// robust homography it reuses. Measured in
// docs/specs/cv-milsnabb-closeup-lock-2026-10.md.
//
// What differs from the precision lock:
//  - the rings are not whole multiples of one step. They sit at 25 mm (X) and
//    10 + 40k mm, so the comb has a phase and is scored on named lines;
//  - only the X, 10, 9 and 8 lines are fitted. They are all printed on the
//    centre card (spegel) that is usually stapled over the face, and the card
//    sits up to ~2 mm off the face's own 7 and 6 rings, so one homography
//    cannot fit both. Holes are scored on what is in front: the card;
//  - a line's centre is fitted half a line width inside its ring, because a
//    ring's diameter is measured to the outer edge of its 1 mm line;
//  - the gate reads each ring per quarter, needs three rings in frame and in
//    the fit (the X and 10 alone read 1:2 on both faces) and the centre in
//    frame.
import type { Homography } from './corners';
import {
  asHomography,
  bilinearAt,
  type CloseupImage,
  type CloseupOps,
  type CloseupWork,
  closeupWorkImage,
  fitEllipse,
  type GrayImage,
  median,
  mul3,
  NANG,
  type M3,
  polarRidge,
  profile,
  pureCloseupOps,
  refineHomography,
  type Ridge,
  unitMap,
  voteCenter,
  WORK_LONG_SIDE,
} from './closeup-lock';
import { invertHomography } from './transform';

/** Ring line k (k >= 1) at 10 + 40 k mm (J.7.1). */
export const MILSNABB_STEP_MM = 40;
/** Half the printed ring line's width (J.7.1: 0.5-1.0 mm; 1.0 measured). */
export const MILSNABB_LINE_INSET_MM = 0.5;
/** The rings the lock fits, mm to the line's outer edge: X, 10, 9, 8. */
export const MILSNABB_CARD_RINGS_MM = [25, 50, 90, 130] as const;

export const MILSNABB_GATE = {
  residualMm: 0.5,
  comb: 8,
  ringOffsetMm: 0.5,
  /** Rings in frame, and rings in the fit: the X and 10 alone read 1:2 on
   *  both faces. A ring in frame with no line on it still reads an offset. */
  minLines: 3,
} as const;

/** Where the line centres sit, mm. */
const LINES_MM = MILSNABB_CARD_RINGS_MM.map((r) => r - MILSNABB_LINE_INSET_MM);
/** The same, in steps. */
const MULTIPLES = LINES_MM.map((r) => r / MILSNABB_STEP_MM);
/** The robust z each line must reach on its own in the period search. */
const LINE_Z = 3;
/** Points further than this from their ring are dropped before the refit. */
const TRIM_MM = 2;
/** A guided pass looks this share of a step either side of the last fit. */
const GUIDE_HALF = 0.1;
/** Arcs per ring the yardstick reads separately. */
const ARCS = 4;

export interface MilsnabbLock {
  /** Image px -> target mm, centre at (0, 0), row-major, [8] = 1. */
  readonly toMm: Homography;
  /** The target centre, image px. */
  readonly center: { readonly x: number; readonly y: number };
  readonly residualMm: number;
  readonly comb: number;
  /** The worst ring quarter's distance from its printed line, mm. */
  readonly ringOffsetMm: number | null;
  /** Rings the yardstick read (in frame). */
  readonly ringLines: number;
  /** Ring lines that took part in the fit. */
  readonly rings: number;
  readonly support: number;
  /** The centre is in the photo. */
  readonly inFrame: boolean;
  /** Work px. */
  readonly voteCenter: { readonly x: number; readonly y: number };
  /** Work px per 40 mm. */
  readonly period: number;
}

// ---------------------------------------------------------------- period

/**
 * Period (px per 40 mm) of a comb with a phase, scored on the four card lines:
 * line strength on them minus strength half-way between neighbours, so a
 * scale that lands on every other line is marked down by the lines it skips.
 * Each of `minLines` lines has to stand out on its own: the precision face's
 * 25 and 50 mm lines would otherwise carry the mean.
 */
function bestPeriodLines(prof: Float64Array): { P: number; comb: number } {
  const valid: number[] = [];
  for (let r = 0; r < prof.length; r += 1) if (!Number.isNaN(prof[r] as number)) valid.push(r);
  if (valid.length < 40) return { P: 0, comb: 0 };
  const rlim = valid[valid.length - 1] as number;
  const vals = Float64Array.from(valid, (r) => prof[r] as number);
  const base = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - base))) + 1e-6;
  const z = Float64Array.from(prof, (v) => (Number.isNaN(v) ? 0 : (v - base) / mad));
  const mids = MULTIPLES.slice(1).map((m, i) => (m + (MULTIPLES[i] as number)) / 2);
  const peak = (r: number, P: number) => {
    const half = Math.max(2, 0.04 * P);
    const end = Math.min(z.length - 1, Math.trunc(r + half));
    let m = -Infinity;
    for (let i = Math.trunc(r - half); i <= end; i += 1) m = Math.max(m, z[i] as number);
    return m;
  };
  const read = (ms: readonly number[], P: number) =>
    ms
      .filter((m) => m * P + 3 < rlim && !Number.isNaN(prof[Math.trunc(m * P)] as number))
      .map((m) => peak(m * P, P));
  const minM = MULTIPLES[MILSNABB_GATE.minLines - 1] as number;
  let best = { P: 0, comb: -1e9 };
  for (let i = 0; (12 + 0.25 * i) * minM + 3 < rlim; i += 1) {
    const P = 12 + 0.25 * i;
    const on = read(MULTIPLES, P);
    const off = read(mids, P);
    if (on.length < MILSNABB_GATE.minLines || off.length === 0) continue;
    const offMax = Math.max(...off);
    if (on.filter((v) => v >= LINE_Z && v > offMax).length < MILSNABB_GATE.minLines) continue;
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const score = mean(on) - mean(off);
    if (score > best.comb) best = { P, comb: score };
  }
  return best.comb <= 0 ? { P: 0, comb: 0 } : best;
}

// ---------------------------------------------------------------- ring points

interface Points {
  x: number[];
  y: number[];
  k: number[];
  seen: number;
  found: number;
}

/** Per ray, the strongest ridge sample in a band, kept where it stands out
 *  from the band's own level; `lo(i)` is the band's first radius on ray i. */
function bandPeaks(
  ridge: Ridge,
  cx: number,
  cy: number,
  m: number,
  width: number,
  lo: (i: number) => number,
  out: Points,
): boolean {
  const { data, nr, cos, sin } = ridge;
  const b = new Float64Array(width);
  const rows: number[] = [];
  for (let i = 0; i < NANG; i += 1) {
    const l = lo(i);
    let ok = l >= 0 && l + width <= nr;
    for (let j = 0; ok && j < width; j += 1) ok = !Number.isNaN(data[i * nr + l + j] as number);
    if (ok) rows.push(i);
  }
  if (rows.length / NANG < 0.15) return false;
  let found = 0;
  for (const i of rows) {
    const l = lo(i);
    for (let j = 0; j < width; j += 1) b[j] = data[i * nr + l + j] as number;
    let jBest = 0;
    for (let j = 1; j < width; j += 1) if ((b[j] as number) > (b[jBest] as number)) jBest = j;
    if (!((b[jBest] as number) > 2 * median(b) + 1)) continue;
    const jj = Math.min(Math.max(jBest, 1), width - 2);
    const y0 = b[jj - 1] as number;
    const y1 = b[jj] as number;
    const y2 = b[jj + 1] as number;
    const den = y0 - 2 * y1 + y2;
    const sub = Math.abs(den) > 1e-6 ? (0.5 * (y0 - y2)) / den : 0;
    const r = l + jj + Math.min(Math.max(sub, -0.5), 0.5);
    out.x.push(cx + r * (cos[i] as number));
    out.y.push(cy + r * (sin[i] as number));
    out.k.push(m);
    found += 1;
  }
  out.seen += rows.length;
  out.found += found;
  return true;
}

/**
 * Along each ray from (cx, cy), the distance to where `inv` (mm -> work px)
 * puts the mm circle of radius R: sampled densely round the circle, then
 * interpolated at each ray's angle.
 */
function ringRadiusPx(inv: readonly number[], R: number, cx: number, cy: number): Float64Array {
  const n = 4 * NANG;
  const pts: { a: number; r: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i * 2 * Math.PI) / n;
    const X = R * Math.cos(t);
    const Y = R * Math.sin(t);
    const w = inv[6]! * X + inv[7]! * Y + inv[8]!;
    const px = (inv[0]! * X + inv[1]! * Y + inv[2]!) / w - cx;
    const py = (inv[3]! * X + inv[4]! * Y + inv[5]!) / w - cy;
    let a = Math.atan2(py, px);
    if (a < 0) a += 2 * Math.PI;
    pts.push({ a, r: Math.hypot(px, py) });
  }
  pts.sort((p, q) => p.a - q.a);
  const out = new Float64Array(NANG);
  let j = 0;
  for (let i = 0; i < NANG; i += 1) {
    const t = (i * 2 * Math.PI) / NANG;
    while (j < n && (pts[j] as { a: number }).a <= t) j += 1;
    const prev = j === 0 ? pts[n - 1]! : pts[j - 1]!;
    const next = j === n ? pts[0]! : pts[j]!;
    const a0 = j === 0 ? prev.a - 2 * Math.PI : prev.a;
    const a1 = j === n ? next.a + 2 * Math.PI : next.a;
    out[i] = a1 > a0 ? prev.r + ((next.r - prev.r) * (t - a0)) / (a1 - a0) : prev.r;
  }
  return out;
}

// ---------------------------------------------------------------- the fit

interface PhasedFit {
  readonly workToMm: M3;
  readonly cx: number;
  readonly cy: number;
  readonly used: number;
  readonly support: number;
  readonly residual: number;
}

function centreOf(H: readonly number[]): { x: number; y: number } | null {
  const inv = invertHomography(asHomography(H));
  return inv ? { x: inv[2] / inv[8], y: inv[5] / inv[8] } : null;
}

/**
 * The first pass fits the three innermost lines, which the period search
 * scored. Each later pass looks for every line only near where the last
 * homography puts it, since tilt moves the outer lines further than a band
 * around k * P allows for, and drops points more than TRIM_MM off their
 * ring before refitting.
 */
function fitPhased(
  g: CloseupImage,
  cx0: number,
  cy0: number,
  P: number,
  first: Ridge,
  ops: CloseupOps,
): PhasedFit | null {
  const pts: Points = { x: [], y: [], k: [], seen: 0, found: 0 };
  for (const m of MULTIPLES.slice(0, 3)) {
    const lo = Math.trunc(m * P - 0.25 * P);
    const hi = Math.trunc(m * P + 0.25 * P) + 1;
    if (hi >= first.nr) break;
    bandPeaks(first, cx0, cy0, m, hi - lo, () => lo, pts);
  }
  if (pts.x.length < 50) return null;
  const nx = Float64Array.from(pts.x, (x, i) => cx0 + (x - cx0) / pts.k[i]!);
  const ny = Float64Array.from(pts.y, (y, i) => cy0 + (y - cy0) / pts.k[i]!);
  const ellipse = fitEllipse(nx, ny);
  if (!ellipse) return null;
  const { m: U } = unitMap(ellipse);
  const step = MILSNABB_STEP_MM;
  let { H } = refineHomography(
    mul3([step, 0, 0, 0, step, 0, 0, 0, 1], U),
    Float64Array.from(pts.x),
    Float64Array.from(pts.y),
    Float64Array.from(pts.k),
    step,
  );
  let last: { residual: number; used: number; support: number } | null = null;
  for (let pass = 0; pass < 2; pass += 1) {
    const inv = invertHomography(asHomography(H));
    const c = centreOf(H);
    if (!inv || !c) return null;
    const ridge = polarRidge(g, c.x, c.y, ops);
    const half = Math.max(3, GUIDE_HALF * P);
    const width = 2 * Math.ceil(half) + 1;
    const got: Points = { x: [], y: [], k: [], seen: 0, found: 0 };
    for (const [i, m] of MULTIPLES.entries()) {
      if (i > 0 && m * P >= ridge.nr) continue;
      const radius = ringRadiusPx(inv, m * step, c.x, c.y);
      bandPeaks(
        ridge,
        c.x,
        c.y,
        m,
        width,
        (ray) => Math.floor((radius[ray] as number) - half),
        got,
      );
    }
    if (got.x.length < 50) return null;
    let px = Float64Array.from(got.x);
    let py = Float64Array.from(got.y);
    let ks = Float64Array.from(got.k);
    ({ H } = refineHomography(H, px, py, ks, step));
    const keep: number[] = [];
    for (let i = 0; i < px.length; i += 1) {
      const X = px[i] as number;
      const Y = py[i] as number;
      const w = H[6]! * X + H[7]! * Y + H[8]!;
      const rho = Math.hypot(
        (H[0]! * X + H[1]! * Y + H[2]!) / w,
        (H[3]! * X + H[4]! * Y + H[5]!) / w,
      );
      if (Math.abs(rho - (ks[i] as number) * step) <= TRIM_MM) keep.push(i);
    }
    if (keep.length < 50) return null;
    px = Float64Array.from(keep, (i) => px[i] as number);
    py = Float64Array.from(keep, (i) => py[i] as number);
    ks = Float64Array.from(keep, (i) => ks[i] as number);
    const refit = refineHomography(H, px, py, ks, step);
    H = refit.H;
    last = {
      residual: refit.residual,
      used: new Set(ks).size,
      support: got.found / Math.max(1, got.seen),
    };
  }
  const c = centreOf(H);
  if (!last || !c) return null;
  return { workToMm: H, cx: c.x, cy: c.y, ...last };
}

// ---------------------------------------------------------------- yardstick

const DEG = Array.from({ length: 360 }, (_, i) => ({
  cos: Math.cos((i * Math.PI) / 180),
  sin: Math.sin((i * Math.PI) / 180),
}));

/** Mean line response along degrees [from, to) of the mm circle R, in frame
 *  only; null when under 30% of that arc is in frame. */
function arcMean(
  lines: CloseupImage,
  inv: readonly number[],
  R: number,
  from: number,
  to: number,
): number | null {
  const { width: w, height: h } = lines;
  let sum = 0;
  let n = 0;
  for (let i = from; i < to; i += 1) {
    const X = R * DEG[i]!.cos;
    const Y = R * DEG[i]!.sin;
    const d = inv[6]! * X + inv[7]! * Y + inv[8]!;
    const x = (inv[0]! * X + inv[1]! * Y + inv[2]!) / d;
    const y = (inv[3]! * X + inv[4]! * Y + inv[5]!) / d;
    if (x >= 0 && x < w - 1 && y >= 0 && y < h - 1) {
      sum += bilinearAt(lines, x, y);
      n += 1;
    }
  }
  return n / (to - from) < 0.3 ? null : sum / n;
}

/**
 * Per ring (mm of the line's centre) and per quarter, the radial offset (mm)
 * at which the line response along the lock's arc peaks; null for a quarter
 * mostly out of frame, and an empty list for a ring mostly out of frame.
 */
function workArcOffsets(
  lines: CloseupImage,
  workToMm: readonly number[],
  radii: readonly number[],
): (number | null)[][] {
  const inv = invertHomography(asHomography(workToMm));
  if (!inv) return radii.map(() => []);
  const win = 3;
  // offsets in tenths of a mm, divided rather than stepped so 0.5 is exact
  const nOff = 2 * win * 10;
  return radii.map((R) => {
    if (arcMean(lines, inv, R, 0, 360) === null) return [];
    const out: (number | null)[] = [];
    for (let j = 0; j < ARCS; j += 1) {
      const from = (j * 360) / ARCS;
      const to = ((j + 1) * 360) / ARCS;
      if (arcMean(lines, inv, R, from, to) === null) {
        out.push(null);
        continue;
      }
      let best = -Infinity;
      let bo = 0;
      for (let i = 0; i <= nOff; i += 1) {
        const o = (i - win * 10) / 10;
        const v = arcMean(lines, inv, R + o, from, to) ?? -1;
        if (v > best) {
          best = v;
          bo = o;
        }
      }
      out.push(bo);
    }
    return out;
  });
}

/**
 * The yardstick for any milsnabb lock, per ring and quarter: where the printed
 * line sits against the lock's circle, mm. `ringsMm` are ring radii to the
 * line's outer edge (130 for the 8); the line centre is read.
 */
export function milsnabbArcOffsetsMm(
  work: CloseupWork,
  toMm: Homography,
  ringsMm: readonly number[] = MILSNABB_CARD_RINGS_MM,
): (number | null)[][] {
  const fromWork = invertHomography(work.toWork);
  if (!fromWork) return ringsMm.map(() => []);
  return workArcOffsets(
    work.lines,
    mul3(toMm, fromWork),
    ringsMm.map((r) => r - MILSNABB_LINE_INSET_MM),
  );
}

// ---------------------------------------------------------------- the lock

export function lockMilsnabbWork(
  work: CloseupWork,
  ops: CloseupOps = pureCloseupOps,
): MilsnabbLock | null {
  const { g, lines } = work;
  const vote = voteCenter(g, ops);
  const ridge = polarRidge(g, vote.x, vote.y, ops);
  const { P, comb } = bestPeriodLines(profile(ridge));
  if (P <= 0) return null;
  const fit = fitPhased(g, vote.x, vote.y, P, ridge, ops);
  if (!fit) return null;
  const arcs = workArcOffsets(lines, fit.workToMm, LINES_MM);
  const read = arcs.filter((a) => a.length > 0);
  const offsets = read.flat().filter((v): v is number => v !== null);
  const toMm = mul3(fit.workToMm, work.toWork);
  const toImage = invertHomography(asHomography(toMm));
  if (!toImage) return null;
  const norm = toMm[8] as number;
  return {
    toMm: asHomography(toMm.map((v) => v / norm)),
    center: { x: toImage[2] / toImage[8], y: toImage[5] / toImage[8] },
    residualMm: fit.residual,
    comb,
    ringOffsetMm: read.length ? Math.max(0, ...offsets.map(Math.abs)) : null,
    ringLines: read.length,
    rings: fit.used,
    support: fit.support,
    inFrame: fit.cx >= 0 && fit.cx <= g.width - 1 && fit.cy >= 0 && fit.cy <= g.height - 1,
    voteCenter: vote,
    period: P,
  };
}

/** Image px -> mm of the milsnabb face from its centre card's ring lines, or
 *  null when they give too little to go on. */
export function lockMilsnabb(
  image: GrayImage,
  ops: CloseupOps = pureCloseupOps,
  longSide = WORK_LONG_SIDE,
): MilsnabbLock | null {
  return lockMilsnabbWork(closeupWorkImage(image, ops, longSide), ops);
}

export function passesMilsnabbGate(lock: MilsnabbLock | null): lock is MilsnabbLock {
  return (
    lock !== null &&
    lock.residualMm <= MILSNABB_GATE.residualMm &&
    lock.comb >= MILSNABB_GATE.comb &&
    lock.ringOffsetMm !== null &&
    lock.ringOffsetMm <= MILSNABB_GATE.ringOffsetMm &&
    lock.ringLines >= MILSNABB_GATE.minLines &&
    lock.rings >= MILSNABB_GATE.minLines &&
    lock.inFrame
  );
}
