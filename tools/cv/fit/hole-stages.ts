// The hole proposal stages the hole/patch filter was fitted behind, on
// OpenCV.js. None of them ships: the app proposes holes with
// hole-proposals.ts. They are kept so the filter's fit can be rerun on the
// candidates it was fitted on (docs/specs/cv-corpus-validation-2026-09.md §5).
//  * tight: the phase-1 detector. Over-sized top-hat (bright tears on black)
//    and black-hat (dark holes on paper), candidates filtered by area,
//    largest inscribed disc, the size of the structure they belong to at a
//    low threshold with the ring lines removed, and colour against the
//    card's own paper.
//  * loose: hole-scale responses with the ring lines and printed digits
//    masked out, thresholded against the zone's own spread. Measured worse
//    than tight.
//  * open: loose with every brake off.
// Precision face only, on a colour canvas at about 4 px/mm.
import type { Cv } from '../eval/opencv-js-disc-ops';
import { FACE } from './label-canvas';

const BULLET_MM = 5.6;
const RING_DIAMETERS_MM = FACE.rings.map((ring) => ring.diameterMm);
const BLACK_MM = FACE.referenceDiameterMm;

export interface StageCanvas {
  /** RGB, 8-bit, row-major. */
  readonly rgb: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly centerXPx: number;
  readonly centerYPx: number;
  readonly pxPerMm: number;
}

export interface StageCandidate {
  readonly x: number;
  readonly y: number;
  readonly rPx: number;
  readonly polarity: string;
  /** loose/open: the peak response over the zone's MAD. */
  readonly response: number;
}

export interface LooseParams {
  readonly kernelScale: number;
  readonly kMad: number;
  readonly minDelta: number;
  readonly glyphScale: number;
  readonly area: readonly [number, number];
  readonly disc: readonly [number, number];
  readonly maxCandidates: number;
}

export const LOOSE: LooseParams = {
  kernelScale: 1.6, // structuring element, in hole diameters
  kMad: 12, // response threshold, in MADs of the zone's grey level
  minDelta: 8, // ... but never below this many grey levels
  glyphScale: 2.6, // a low-threshold structure longer than this is print
  area: [0.15, 6.0], // blob area, in units of a hole's area
  disc: [0.18, 1.1], // largest inscribed disc, in hole diameters
  maxCandidates: 40, // keep the strongest responses per photo
};

/** LOOSE with no glyph suppression, a threshold of 6 MADs and no binding cap. */
export const OPEN: LooseParams = { ...LOOSE, glyphScale: 1e9, kMad: 6, maxCandidates: 200 };

type Mask = Uint8Array;

/** numpy's linear percentile of an ascending `sorted`, its `_lerp` included. */
function percentile(sorted: ArrayLike<number>, q: number, f32 = false): number {
  const idx = (q / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const t = idx - lo;
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  const r = (v: number) => (f32 ? Math.fround(v) : v);
  const diff = r(b - a);
  return t >= 0.5 ? r(b - r(diff * (1 - t))) : r(a + r(diff * t));
}

/** The k-th smallest (0-based) of the values a histogram counts. */
function kth(hist: ArrayLike<number>, k: number): number {
  let seen = 0;
  for (let v = 0; v < hist.length; v += 1) {
    seen += hist[v]!;
    if (seen > k) return v;
  }
  throw new RangeError('k past the histogram');
}

/** numpy's median of the values a histogram counts, at `scale` per bin. */
function histMedian(hist: ArrayLike<number>, n: number, scale = 1): number {
  if (n % 2) return kth(hist, (n - 1) / 2) / scale;
  return (kth(hist, n / 2 - 1) + kth(hist, n / 2)) / 2 / scale;
}

/** numpy's median of the grey values under `mask`. */
function maskedMedian(gray: Uint8Array, mask: Mask): { median: number; n: number } {
  const hist = new Float64Array(256);
  let n = 0;
  for (let i = 0; i < gray.length; i += 1) {
    if (mask[i]) {
      hist[gray[i]!] += 1;
      n += 1;
    }
  }
  return { median: n ? histMedian(hist, n) : NaN, n };
}

class Arena {
  private readonly items: { delete(): void }[] = [];
  keep<T extends { delete(): void }>(m: T): T {
    this.items.push(m);
    return m;
  }
  release(): void {
    for (const m of this.items.reverse()) m.delete();
    this.items.length = 0;
  }
}

/** OpenCV.js calls on byte masks, with cv2's default arguments spelled out. */
function ops(cv: Cv, width: number, height: number, arena: Arena) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenCV.js Mats
  const mat = (data: Uint8Array): any =>
    arena.keep(cv.matFromArray(height, width, cv.CV_8UC1, data));
  const out = () => arena.keep(new cv.Mat());
  const ones = (k: number) =>
    arena.keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k), new cv.Point(-1, -1)));
  const ellipse = (k: number) =>
    arena.keep(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k), new cv.Point(-1, -1)));
  const anchor = () => new cv.Point(-1, -1);
  const morph = (src: Uint8Array, op: number, kernel: unknown): Uint8Array => {
    const dst = out();
    cv.morphologyEx(
      mat(src),
      dst,
      op,
      kernel,
      anchor(),
      1,
      cv.BORDER_CONSTANT,
      cv.morphologyDefaultBorderValue(),
    );
    return (dst.data as Uint8Array).slice();
  };
  const erodeOrDilate = (src: Uint8Array, kernel: unknown, erode: boolean): Uint8Array => {
    const dst = out();
    (erode ? cv.erode : cv.dilate)(
      mat(src),
      dst,
      kernel,
      anchor(),
      1,
      cv.BORDER_CONSTANT,
      cv.morphologyDefaultBorderValue(),
    );
    return (dst.data as Uint8Array).slice();
  };
  return {
    ones,
    ellipse,
    open: (src: Uint8Array, kernel: unknown) => morph(src, cv.MORPH_OPEN, kernel),
    close: (src: Uint8Array, kernel: unknown) => morph(src, cv.MORPH_CLOSE, kernel),
    tophat: (src: Uint8Array, kernel: unknown) => morph(src, cv.MORPH_TOPHAT, kernel),
    blackhat: (src: Uint8Array, kernel: unknown) => morph(src, cv.MORPH_BLACKHAT, kernel),
    erode: (src: Uint8Array, kernel: unknown) => erodeOrDilate(src, kernel, true),
    dilate: (src: Uint8Array, kernel: unknown) => erodeOrDilate(src, kernel, false),
    /** cv2.circle on a zero mask; thickness -1 fills. */
    circles: (cx: number, cy: number, radii: readonly number[], thickness = -1): Mask => {
      const m = arena.keep(cv.Mat.zeros(height, width, cv.CV_8UC1));
      for (const r of radii) {
        cv.circle(m, new cv.Point(cx, cy), r, new cv.Scalar(255), thickness, cv.LINE_8, 0);
      }
      return (m.data as Uint8Array).slice();
    },
    components: (src: Uint8Array) => {
      const labels = out();
      const stats = out();
      const centroids = out();
      const n = cv.connectedComponentsWithStats(mat(src), labels, stats, centroids, 8, cv.CV_32S);
      return {
        n: n as number,
        labels: (labels.data32S as Int32Array).slice(),
        stats: (stats.data32S as Int32Array).slice(),
        centroids: (centroids.data64F as Float64Array).slice(),
      };
    },
    distance: (src: Uint8Array): Float32Array => {
      const dst = out();
      cv.distanceTransform(mat(src), dst, cv.DIST_L2, 3);
      return (dst.data32F as Float32Array).slice();
    },
  };
}
type Ops = ReturnType<typeof ops>;

// cv.CC_STAT_* columns
const WIDTH = 2;
const HEIGHT = 3;
const AREA = 4;

const and = (a: Mask, b: Mask): Mask => a.map((v, i) => (v && b[i] ? 255 : 0));
const andNot = (a: Mask, b: Mask): Mask => a.map((v, i) => (v && !b[i] ? 255 : 0));

/** The canvas in grey, as the stages and the features see it. */
export function stageGray(cv: Cv, c: StageCanvas): Uint8Array {
  const rgb = cv.matFromArray(c.height, c.width, cv.CV_8UC3, c.rgb);
  const gray = new cv.Mat();
  try {
    cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
    return (gray.data as Uint8Array).slice();
  } finally {
    gray.delete();
    rgb.delete();
  }
}

/** Erode the card's border away, so the card/background step and the warp's
 *  white padding cannot pass for holes. */
function cardMask(o: Ops, gray: Uint8Array): Mask {
  let m: Mask = gray.map((v) => (v > 8 && v < 250 ? 255 : 0));
  m = o.close(m, o.ones(25));
  const cc = o.components(m);
  if (cc.n > 1) {
    let big = 1;
    for (let j = 2; j < cc.n; j += 1) {
      if (cc.stats[5 * j + AREA]! > cc.stats[5 * big + AREA]!) big = j;
    }
    m = m.map((_, i) => (cc.labels[i] === big ? 255 : 0));
  }
  return o.erode(m, o.ones(17));
}

/** Where the printed ring lines are, from the fitted geometry. */
function ringLineMask(o: Ops, c: StageCanvas, dPx: number): Mask {
  return o.circles(
    Math.trunc(c.centerXPx),
    Math.trunc(c.centerYPx),
    RING_DIAMETERS_MM.map((dia) => Math.trunc((dia / 2) * c.pxPerMm)),
    Math.max(3, Math.trunc(0.35 * dPx)),
  );
}

/** Median colour of the card's light zone, [R, G, B]: the colour the printed
 *  ring digits are knocked out in. */
function paperColour(c: StageCanvas, paperZone: Mask): number[] | null {
  const sums: number[] = [];
  for (let i = 0; i < paperZone.length; i += 1) {
    if (paperZone[i]) sums.push(c.rgb[3 * i]! + c.rgb[3 * i + 1]! + c.rgb[3 * i + 2]!);
  }
  if (sums.length < 500) return null;
  // the per-pixel mean is float32 in the reference, and so is its percentile
  const means = Float32Array.from(sums, (s) => s / 3).sort();
  const cut = percentile(means, 40, true);
  const hist = [0, 1, 2].map(() => new Float64Array(256));
  let n = 0;
  let k = 0;
  for (let i = 0; i < paperZone.length; i += 1) {
    if (!paperZone[i]) continue;
    if (Math.fround(sums[k++]! / 3) > cut) {
      for (let ch = 0; ch < 3; ch += 1) hist[ch]![c.rgb[3 * i + ch]!] += 1;
      n += 1;
    }
  }
  return hist.map((h) => histMedian(h, n));
}

/** Pixel indices per component label. */
function members(labels: Int32Array, n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < labels.length; i += 1) if (labels[i]! > 0) out[labels[i]!]!.push(i);
  return out;
}

/** Centroid, or for a blob merged with a line, the centre of its widest part. */
function blobCentre(
  idx: number[],
  dist: Float32Array,
  dt: number,
  centroid: [number, number],
  merged: boolean,
  width: number,
): [number, number] {
  if (!merged) return centroid;
  let sx = 0;
  let sy = 0;
  let k = 0;
  for (const i of idx) {
    if (dist[i]! >= dt - 1) {
      sx += i % width;
      sy += Math.floor(i / width);
      k += 1;
    }
  }
  return [sx / k, sy / k];
}

function blobsTight(
  o: Ops,
  c: StageCanvas,
  respIn: Uint8Array,
  gray: Uint8Array,
  zone: Mask,
  dPx: number,
  polarity: 'bright' | 'dark',
  lines: Mask,
  paper: number[] | null,
): StageCandidate[] {
  const resp = respIn.map((v, i) => (zone[i] ? v : 0));
  let max = 0;
  const hist = new Float64Array(256);
  let positives = 0;
  for (let i = 0; i < resp.length; i += 1) {
    max = Math.max(max, resp[i]!);
    if (zone[i] && resp[i]! > 0) {
      hist[resp[i]!] += 1;
      positives += 1;
    }
  }
  if (max < 12) return [];
  let thr = 255;
  if (positives) {
    const sorted = new Uint8Array(positives);
    let k = 0;
    for (let v = 0; v < 256; v += 1) sorted.fill(v, k, (k += hist[v]!));
    thr = Math.max(12, Math.trunc(percentile(sorted, 93)));
  }
  thr = Math.min(thr, Math.trunc(0.4 * max));
  const bw = o.open(
    resp.map((v) => (v > thr ? 255 : 0)),
    o.ones(3),
  );
  // the same image at a low threshold: a hole stays a small island, a
  // fragment of a printed digit grows into its parent structure
  const { median, n } = maskedMedian(gray, zone);
  const bg = n ? median : 128;
  const delta = 35;
  let lo: Mask = gray.map((v, i) =>
    zone[i] && (polarity === 'bright' ? v > bg + delta : v < bg - delta) ? 255 : 0,
  );
  lo = o.close(andNot(lo, lines), o.ones(3));
  const ccLo = o.components(lo);
  const cc = o.components(bw);
  const dist = o.distance(bw);
  const unit = Math.PI * (dPx / 2) ** 2;
  const out: StageCandidate[] = [];
  members(cc.labels, cc.n).forEach((idx, i) => {
    if (i === 0) return;
    const a = cc.stats[5 * i + AREA]!;
    if (!(0.3 * unit <= a && a <= 8.0 * unit)) return;
    let dt = 0;
    for (const p of idx) dt = Math.max(dt, dist[p]!);
    if (!(0.26 * dPx <= dt && dt <= 0.95 * dPx)) return;
    const [x, y] = blobCentre(
      idx,
      dist,
      dt,
      [cc.centroids[2 * i]!, cc.centroids[2 * i + 1]!],
      a > 2.0 * unit,
      c.width,
    );
    // judge the blob by every low-threshold structure its pixels touch
    const js = new Set<number>();
    for (const p of idx) if (ccLo.labels[p]! > 0) js.add(ccLo.labels[p]!);
    if (js.size === 0) return;
    for (const j of js) {
      const sw = ccLo.stats[5 * j + WIDTH]!;
      const sh = ccLo.stats[5 * j + HEIGHT]!;
      if (Math.max(sw, sh) > 2.6 * dPx) return; // far too big to be a .22 hole
    }
    // a ring digit in the black is a knockout, exactly the paper's colour
    if (polarity === 'bright' && paper && colourDistance(c, idx, paper) < 4.0) return;
    out.push({ x, y, rPx: Math.sqrt(a / Math.PI), polarity, response: 0 });
  });
  return out;
}

/** Hue/chroma distance of a blob's median colour from the paper's. */
function colourDistance(c: StageCanvas, idx: number[], paper: number[]): number {
  const hist = [0, 1, 2].map(() => new Float64Array(256));
  for (const i of idx) for (let ch = 0; ch < 3; ch += 1) hist[ch]![c.rgb[3 * i + ch]!] += 1;
  const [r, g, b] = hist.map((h) => histMedian(h, idx.length)) as [number, number, number];
  const [pr, pg, pb] = paper as [number, number, number];
  return Math.abs(r - b - (pr - pb)) + Math.abs(g - b - (pg - pb));
}

/** Keep the largest of candidates closer than 0.8 hole diameters. */
function dedupe(holes: StageCandidate[], dPx: number): StageCandidate[] {
  const keep: StageCandidate[] = [];
  for (const h of [...holes].sort((a, b) => b.rPx - a.rPx)) {
    if (keep.every((k) => Math.hypot(h.x - k.x, h.y - k.y) > 0.8 * dPx)) keep.push(h);
  }
  return keep;
}

function zones(o: Ops, c: StageCanvas, gray: Uint8Array) {
  const cx = Math.trunc(c.centerXPx);
  const cy = Math.trunc(c.centerYPx);
  const card = cardMask(o, gray);
  const inZone = and(
    o.circles(cx, cy, [Math.trunc((RING_DIAMETERS_MM.at(-1)! / 2) * c.pxPerMm)]),
    card,
  );
  const black = and(o.circles(cx, cy, [Math.trunc((BLACK_MM / 2) * c.pxPerMm * 0.985)]), card);
  return { inZone, black, paper: andNot(inZone, black) };
}

/** The phase-1 detector. */
export function tightStage(cv: Cv, c: StageCanvas): StageCandidate[] {
  const arena = new Arena();
  try {
    const o = ops(cv, c.width, c.height, arena);
    const gray = stageGray(cv, c);
    const dPx = BULLET_MM * c.pxPerMm;
    const z = zones(o, c, gray);
    // a kernel ~3.5 holes wide keeps a printed digit whole, so the size
    // filter can throw it away
    const k = o.ellipse(Math.max(3, Math.trunc(dPx * 3.5)) | 1);
    const lines = ringLineMask(o, c, dPx);
    const paper = paperColour(c, z.paper);
    return dedupe(
      [
        ...blobsTight(o, c, o.tophat(gray, k), gray, z.black, dPx, 'bright', lines, paper),
        ...blobsTight(o, c, o.blackhat(gray, k), gray, z.paper, dPx, 'dark', lines, paper),
      ],
      dPx,
    );
  } finally {
    arena.release();
  }
}

type Polarity = 'bright' | 'dark' | 'dark_black' | 'bright_paper';

function looseChannel(
  o: Ops,
  c: StageCanvas,
  gray: Uint8Array,
  zone: Mask,
  polarity: Polarity,
  /** The top-hat for a bright polarity, the black-hat for a dark one. */
  response: Uint8Array,
  lines: Mask,
  linesDilated: Mask,
  dPx: number,
  p: LooseParams,
): StageCandidate[] {
  const resp = Float32Array.from(response);
  const { median: bg, n } = maskedMedian(gray, zone);
  // |z - bg| in half grey levels, exact
  const dev = new Float64Array(512);
  for (let i = 0; i < gray.length; i += 1) if (zone[i]) dev[Math.abs(2 * gray[i]! - 2 * bg)] += 1;
  const mad = histMedian(dev, n, 2) + 0.5;
  // printed digits: whatever stands out at a low threshold and is far longer
  // than a hole once the ring lines are removed
  const up = polarity === 'bright' || polarity === 'dark_black';
  let lo: Mask = gray.map((v, i) => (zone[i] && (up ? v > bg + 35 : v < bg - 35) ? 255 : 0));
  lo = o.close(andNot(lo, lines), o.ones(3));
  const ccLo = o.components(lo);
  let glyph: Mask = new Uint8Array(gray.length);
  const isGlyph = new Uint8Array(ccLo.n);
  for (let j = 1; j < ccLo.n; j += 1) {
    const w = ccLo.stats[5 * j + WIDTH]!;
    const h = ccLo.stats[5 * j + HEIGHT]!;
    if (Math.max(w, h) > p.glyphScale * dPx) isGlyph[j] = 1;
  }
  for (let i = 0; i < glyph.length; i += 1) if (isGlyph[ccLo.labels[i]!]) glyph[i] = 255;
  glyph = o.dilate(glyph, o.ones(Math.trunc(0.5 * dPx) | 1));
  for (let i = 0; i < resp.length; i += 1) {
    if (!zone[i] || linesDilated[i] || glyph[i]) resp[i] = 0;
  }
  const thr = Math.max(p.minDelta, p.kMad * mad);
  const bw = o.open(
    Uint8Array.from(resp, (v) => (v >= thr ? 255 : 0)),
    o.ones(3),
  );
  const cc = o.components(bw);
  const dist = o.distance(bw);
  const unit = Math.PI * (dPx / 2) ** 2;
  const out: StageCandidate[] = [];
  members(cc.labels, cc.n).forEach((idx, i) => {
    if (i === 0) return;
    const a = cc.stats[5 * i + AREA]!;
    if (!(p.area[0] * unit <= a && a <= p.area[1] * unit)) return;
    let dt = 0;
    let peak = 0;
    for (const q of idx) {
      dt = Math.max(dt, dist[q]!);
      peak = Math.max(peak, resp[q]!);
    }
    if (!(p.disc[0] * dPx <= dt && dt <= p.disc[1] * dPx)) return;
    const [x, y] = blobCentre(
      idx,
      dist,
      dt,
      [cc.centroids[2 * i]!, cc.centroids[2 * i + 1]!],
      a > 2 * unit,
      c.width,
    );
    out.push({ x, y, rPx: Math.sqrt(a / Math.PI), polarity, response: peak / mad });
  });
  return out;
}

/** The loosened stage, LOOSE or OPEN. */
export function looseStage(cv: Cv, c: StageCanvas, p: LooseParams = LOOSE): StageCandidate[] {
  const arena = new Arena();
  try {
    const o = ops(cv, c.width, c.height, arena);
    const gray = stageGray(cv, c);
    const dPx = BULLET_MM * c.pxPerMm;
    const z = zones(o, c, gray);
    const lines = ringLineMask(o, c, dPx);
    const linesDilated = o.dilate(lines, o.ones(Math.trunc(0.4 * dPx) | 1));
    const k = o.ellipse(Math.max(3, Math.trunc(dPx * p.kernelScale)) | 1);
    // each is a large-kernel morphology, the slow part on OpenCV.js: once each
    let top: Uint8Array | undefined;
    let black: Uint8Array | undefined;
    const response = (polarity: Polarity) =>
      polarity === 'bright' || polarity === 'bright_paper'
        ? (top ??= o.tophat(gray, k))
        : (black ??= o.blackhat(gray, k));
    const out: StageCandidate[] = [];
    for (const [zone, polarity] of [
      [z.black, 'bright'],
      [z.paper, 'dark'],
      [z.black, 'dark_black'],
      [z.paper, 'bright_paper'],
    ] as const) {
      if (!zone.some((v) => v)) continue;
      out.push(
        ...looseChannel(
          o,
          c,
          gray,
          zone,
          polarity,
          response(polarity),
          lines,
          linesDilated,
          dPx,
          p,
        ),
      );
    }
    return dedupe(out, dPx)
      .sort((a, b) => b.response - a.response)
      .slice(0, p.maxCandidates);
  } finally {
    arena.release();
  }
}
