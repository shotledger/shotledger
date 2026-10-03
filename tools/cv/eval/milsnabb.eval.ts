// The milsnabb lock (milsnabb-lock.ts) measured on real photos, and the
// negatives its gate must refuse. Not part of `pnpm check`: the photos live
// outside the repo (docs/specs/cv-milsnabb-closeup-lock-2026-10.md).
//
//   CV_MIL_SETS=<tsv: pgm path, set, framing, face> CV_MIL_OUT=<out.jsonl> \
//   [CV_MIL_SHARD=i/n] [CV_MIL_CROPS=1] \
//     pnpm exec vitest run -c tools/cv/vitest.config.ts milsnabb.eval
//
// Per milsnabb photo: the milsnabb lock on the whole photo; the precision
// close-up lock on it (a negative); and, around a passing whole-photo lock,
// crops of the 10, the 9-10 and a wider 9-10, centred and off-centre, plus
// crops with the centre out of frame (negatives), each under both locks.
// Per precision photo: the milsnabb lock on the whole photo and on crops
// around its disc lock (all negatives).
import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import {
  closeupWorkImage,
  type GrayImage,
  lockCloseupWork,
  passesCloseupGate,
} from '../../../app/src/features/photo-scoring/closeup-lock';
import { applyHomography, type Homography } from '../../../app/src/features/photo-scoring/corners';
import {
  lockMilsnabbWork,
  milsnabbArcOffsetsMm,
  type MilsnabbLock,
  passesMilsnabbGate,
} from '../../../app/src/features/photo-scoring/milsnabb-lock';
import { invertHomography } from '../../../app/src/features/photo-scoring/transform';
import { runDisc } from './disc-run';
import { loadOpenCv } from './opencv-js-disc-ops';
import { readPgm } from './pgm';

const sets = process.env.CV_MIL_SETS;
const out = process.env.CV_MIL_OUT;
const [shard, shards] = (process.env.CV_MIL_SHARD ?? '0/1').split('/').map(Number) as [
  number,
  number,
];
const withCrops = process.env.CV_MIL_CROPS === '1';

/** Half-width (mm) of each view; a crop is 1.33 times as tall. */
const MIL_VIEWS = [
  ['10', 55],
  ['9-10', 100],
  ['9-10 wide', 120],
] as const;
const PRE_VIEWS = [
  ['pre 9-10', 55],
  ['pre 8-10', 80],
  ['pre 7-10', 110],
  ['mil 9-10', 100],
  ['mil 9-10 wide', 120],
] as const;
/** [half-width, centre offset x, y] mm: none has the centre in frame. */
const MIL_OUTER = [
  [60, 0, 150],
  [60, 0, -150],
  [60, 70, 0],
  [60, -70, 0],
  [40, 0, 210],
  [40, 0, -210],
  [40, 55, 120],
  [40, -55, -120],
] as const;
const PRE_OUTER = [
  [80, 170, 0],
  [80, 0, 170],
  [80, -170, 0],
] as const;
/** Face rings outside the centre card, read through a card lock. */
const FACE_RINGS_MM = [170, 210] as const;
const REF_RADIUS_MM = 90;

/** A small deterministic generator, so a rerun cuts the same crops. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Crop {
  readonly view: string;
  readonly trial: number | 'outer';
  readonly image: GrayImage;
  /** crop px -> original px */
  readonly back: Homography;
}

/** Bilinear crop of [x0, x1) x [y0, y1), resized so its long side is 2048. */
function cut(g: GrayImage, x0: number, y0: number, x1: number, y1: number) {
  const up = 2048 / Math.max(x1 - x0, y1 - y0);
  const w = Math.round((x1 - x0) * up);
  const h = Math.round((y1 - y0) * up);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(Math.max(y0 + (y + 0.5) / up - 0.5, 0), g.height - 1);
    const iy = Math.min(Math.floor(sy), g.height - 2);
    const fy = sy - iy;
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(Math.max(x0 + (x + 0.5) / up - 0.5, 0), g.width - 1);
      const ix = Math.min(Math.floor(sx), g.width - 2);
      const fx = sx - ix;
      const at = (xx: number, yy: number) => g.data[yy * g.width + xx] as number;
      const v =
        (1 - fy) * ((1 - fx) * at(ix, iy) + fx * at(ix + 1, iy)) +
        fy * ((1 - fx) * at(ix, iy + 1) + fx * at(ix + 1, iy + 1));
      data[y * w + x] = Math.round(v);
    }
  }
  const s = 1 / up;
  const back = [
    s,
    0,
    x0 + 0.5 * s - 0.5,
    0,
    s,
    y0 + 0.5 * s - 0.5,
    0,
    0,
    1,
  ] as unknown as Homography;
  return { image: { width: w, height: h, data }, back };
}

function* crops(
  g: GrayImage,
  toMm: Homography,
  views: readonly (readonly [string, number])[],
  outer: readonly (readonly [number, number, number])[],
  trials: number,
  random: () => number,
): Generator<Crop> {
  const toImage = invertHomography(toMm)!;
  const c0 = applyHomography(toImage, { x: 0, y: 0 });
  const px = applyHomography(toImage, { x: 1, y: 0 });
  const py = applyHomography(toImage, { x: 0, y: 1 });
  const ppmm = Math.sqrt(Math.abs((px.x - c0.x) * (py.y - c0.y) - (px.y - c0.y) * (py.x - c0.x)));
  const specs: [string, number, number | 'outer', number, number][] = [];
  for (const [view, hw] of views) {
    for (let t = 0; t < trials; t += 1) {
      const ox = t ? (random() * 0.6 - 0.3) * hw : 0;
      const oy = t ? (random() * 0.6 - 0.3) * hw : 0;
      specs.push([view, hw, t, ox, oy]);
    }
  }
  for (const [hw, dx, dy] of outer) specs.push(['outer', hw, 'outer', dx, dy]);
  for (const [view, hw, trial, ox, oy] of specs) {
    const cx = c0.x + ox * ppmm;
    const cy = c0.y + oy * ppmm;
    const x0 = Math.trunc(cx - hw * ppmm);
    const x1 = Math.trunc(cx + hw * ppmm);
    const y0 = Math.trunc(cy - 1.33 * hw * ppmm);
    const y1 = Math.trunc(cy + 1.33 * hw * ppmm);
    if (x0 < 0 || y0 < 0 || x1 > g.width || y1 > g.height) continue;
    yield { view, trial, ...cut(g, x0, y0, x1, y1) };
  }
}

const round = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? null : Number(v.toFixed(d));

function mul(a: readonly number[], b: readonly number[]): Homography {
  const o: number[] = [];
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 3; c += 1)
      o.push(a[3 * r]! * b[c]! + a[3 * r + 1]! * b[3 + c]! + a[3 * r + 2]! * b[6 + c]!);
  return o as unknown as Homography;
}

function milRow(image: GrayImage, ref?: Homography) {
  const t0 = performance.now();
  const work = closeupWorkImage(image);
  const lock: MilsnabbLock | null = lockMilsnabbWork(work);
  const row: Record<string, unknown> = { ms: Math.round(performance.now() - t0) };
  if (!lock) return { ...row, status: 'none', passes: false };
  Object.assign(row, {
    status: 'lock',
    passes: passesMilsnabbGate(lock),
    res: round(lock.residualMm),
    comb: round(lock.comb, 1),
    off: round(lock.ringOffsetMm, 1),
    lines: lock.ringLines,
    inFrame: lock.inFrame,
    arcs: milsnabbArcOffsetsMm(work, lock.toMm),
    faceArcs: milsnabbArcOffsetsMm(work, lock.toMm, FACE_RINGS_MM),
    toMm: lock.toMm,
  });
  if (ref) {
    const c = applyHomography(ref, lock.center);
    row.centreMm = round(Math.hypot(c.x, c.y));
    const errs: number[] = [];
    for (let i = 0; i <= 24; i += 1) {
      for (let j = 0; j <= 32; j += 1) {
        const p = { x: (i * (image.width - 1)) / 24, y: (j * (image.height - 1)) / 32 };
        const a = applyHomography(ref, p);
        const rRef = Math.hypot(a.x, a.y);
        if (rRef > REF_RADIUS_MM) continue;
        const b = applyHomography(lock.toMm, p);
        errs.push(Math.abs(Math.hypot(b.x, b.y) - rRef));
      }
    }
    errs.sort((x, y) => x - y);
    row.rErrMed = errs.length ? round(errs[errs.length >> 1]) : null;
  }
  return row;
}

function preRow(image: GrayImage) {
  const lock = lockCloseupWork(closeupWorkImage(image));
  return { status: lock ? 'lock' : 'none', passes: passesCloseupGate(lock) };
}

test.skipIf(!sets || !out)('the milsnabb lock and its negatives', async () => {
  const cv = await loadOpenCv();
  const lines: string[] = [];
  const emit = (r: Record<string, unknown>) => {
    lines.push(JSON.stringify(r));
    writeFileSync(out!, lines.join('\n') + '\n');
  };
  const items = readFileSync(sets!, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t') as [string, string, string, string])
    .filter((_, i) => i % shards === shard);
  for (const [path, set, framing, face] of items) {
    const photo = path
      .split('/')
      .pop()!
      .replace(/\.pgm$/, '');
    const gray = readPgm(path);
    const base = { photo, set, framing, face };
    const random = rng(7 + photo.length * 31 + photo.charCodeAt(photo.length - 5));
    if (face === 'milsnabb') {
      const whole = milRow(gray);
      emit({ ...base, view: 'full', trial: 'full', model: 'milsnabb', ...whole });
      emit({ ...base, view: 'full', trial: 'full', model: 'precision', ...preRow(gray) });
      if (!withCrops || !whole.passes) continue;
      const ref = whole.toMm as Homography;
      for (const c of crops(gray, ref, MIL_VIEWS, MIL_OUTER, 3, random)) {
        const refCrop = mul(ref, c.back);
        const m = milRow(c.image, c.trial === 'outer' ? undefined : refCrop);
        delete m.toMm;
        emit({ ...base, view: c.view, trial: c.trial, model: 'milsnabb', ...m });
        emit({ ...base, view: c.view, trial: c.trial, model: 'precision', ...preRow(c.image) });
      }
    } else {
      const whole = milRow(gray);
      delete whole.toMm;
      emit({ ...base, view: 'full', trial: 'full', model: 'milsnabb', ...whole });
      if (!withCrops) continue;
      const disc = runDisc(cv, gray);
      const ref = disc.validity?.valid && disc.toMm ? disc.toMm : null;
      if (!ref) continue;
      for (const c of crops(gray, ref, PRE_VIEWS, PRE_OUTER, 2, random)) {
        const m = milRow(c.image);
        delete m.toMm;
        emit({ ...base, view: c.view, trial: c.trial, model: 'milsnabb', ...m });
      }
    }
  }
  expect(lines.length).toBeGreaterThan(0);
});
