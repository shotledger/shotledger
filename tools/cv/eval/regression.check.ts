// The photo-scoring regression check CI runs (#864): the app's locks, hole
// proposals and scorer on synthetic photos whose holes are known, so a change
// to photo scoring cannot move a score silently. Synthetic only (hard rule 7);
// real photos stay with the local `eval/` tools until a consented subset can be
// committed.
//
// Each scene is a target drawn through a known mm -> photo px mapping, holes
// and all. The pipeline is the one scan.tsx runs: the scene's lock and its
// rectified canvas (app-canvas.ts), proposeHoles at the shipped threshold, then
// scoreHole. A ring lock fixes the centre and scale but not the rotation (the
// face is concentric circles), so holes are compared by radius, sorted, not by
// position; scenes keep their holes far enough apart in radius for that pairing
// to be the right one.
//
// A scene passes when the lock holds, it proposes exactly its holes, each
// radius is within the scene's tolerance, and every score matches. Holes sit
// clear of ring edges by more than the tolerance, so a score can only change
// when the measurement drifts past it. The tolerance is what the code measured
// on 2026-10-19 plus a margin; the disc lock's on a tilted photo is wider
// because it fits an ellipse, which takes out rotation and stretch but not
// perspective.
//
//   pnpm cv:regression
//
// CV_REGRESSION_OUT=<file.jsonl> also writes one line per scene.
import { appendFileSync, writeFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { proposeHoles } from '../../../app/src/features/photo-scoring/hole-proposals';
import { hash32 } from '../../../app/src/features/photo-scoring/synthetic-canvas';
import { scoreHole } from '../../../shared/src/target-scoring/score';
import {
  SPSF_PISTOL_25M_PRECISION,
  SPSF_SNABBSKJUTNING_25M,
} from '../../../shared/src/target-scoring/targets';
import type { Lock } from '../fit/label-canvas';
import { appCanvas, CALIBER_MM, proposalFace } from './app-canvas';
import { loadOpenCv } from './opencv-js-disc-ops';

type M3 = readonly number[];

const mul = (a: M3, b: M3) =>
  [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => a[3 * r]! * b[c]! + a[3 * r + 1]! * b[3 + c]! + a[3 * r + 2]! * b[6 + c]!),
  );

function invert(m: M3): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const co = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ];
  const det = a * co[0]! + b * co[3]! + c * co[6]!;
  return co.map((v) => v / det);
}

interface Scene {
  readonly name: string;
  readonly lock: Lock;
  readonly width: number;
  readonly height: number;
  /** Where the target centre lands, photo px, and the scale there. */
  readonly cx: number;
  readonly cy: number;
  readonly pxPerMm: number;
  readonly rotDeg?: number;
  /** y scale against x: the target seen at an angle. */
  readonly aniso?: number;
  /** Perspective, per mm along the target's x axis. */
  readonly tilt?: number;
  readonly seed: number;
  /** Hole centres, target mm. */
  readonly holes: readonly (readonly [number, number])[];
  /** Largest radius error allowed, mm. */
  readonly toleranceMm: number;
}

// The precision face: black to 100 mm with white lines in it, black lines on
// the paper out to 250 mm; every line 0.6 mm wide inside its radius.
const PRECISION_LINES_MM = [12.5, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250];
function precisionShade(X: number, Y: number): number {
  const r = Math.hypot(X, Y);
  const onLine = PRECISION_LINES_MM.some((R) => r <= R && r >= R - 0.6);
  if (r <= 100) return onLine ? 205 : 30;
  if (r <= 260) return onLine ? 40 : 225;
  return 235;
}

// label-canvas.check.ts's milsnabb face: black out to 250 mm, a centre card
// printed with the 25, 50, 90 and 130 mm lines.
function milsnabbShade(X: number, Y: number): number {
  const onCard = Math.abs(X) <= 140 && Math.abs(Y) <= 140 && Math.abs(X) + Math.abs(Y) <= 240;
  const r = Math.hypot(X, Y);
  if (onCard) return [25, 50, 90, 130].some((R) => r <= R && r >= R - 1) ? 205 : 48;
  return r > 250 ? 225 : 36;
}

const SUBSAMPLES = [0.25, 0.25, 0.75, 0.25, 0.25, 0.75, 0.75, 0.75];

/** The scene's grey photo: four samples a pixel, a torn rim round each hole,
 *  and grain, all from integer hashes so every run draws it alike. */
function render(s: Scene): Uint8Array {
  const t = ((s.rotDeg ?? 0) * Math.PI) / 180;
  const k = s.pxPerMm;
  const ky = k * (s.aniso ?? 1);
  const mmToPx = mul(
    mul(
      [1, 0, s.cx, 0, 1, s.cy, 0, 0, 1],
      [Math.cos(t) * k, -Math.sin(t) * k, 0, Math.sin(t) * ky, Math.cos(t) * ky, 0, 0, 0, 1],
    ),
    [1, 0, 0, 0, 1, 0, s.tilt ?? 0, 0, 1],
  );
  const h = invert(mmToPx);
  const shade = s.lock === 'milsnabb' ? milsnabbShade : precisionShade;
  const r = CALIBER_MM / 2;
  const holes = s.holes.flat();
  const out = new Uint8Array(s.width * s.height);
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      let sum = 0;
      for (let j = 0; j < SUBSAMPLES.length; j += 2) {
        const px = x + SUBSAMPLES[j]!;
        const py = y + SUBSAMPLES[j + 1]!;
        const w = h[6]! * px + h[7]! * py + h[8]!;
        const X = (h[0]! * px + h[1]! * py + h[2]!) / w;
        const Y = (h[3]! * px + h[4]! * py + h[5]!) / w;
        let v = shade(X, Y);
        for (let i = 0; i < holes.length; i += 2) {
          const d = Math.hypot(X - holes[i]!, Y - holes[i + 1]!);
          const torn =
            d <= r + 0.7 && hash32(Math.floor(X * 4), Math.floor(Y * 4), s.seed) % 3 === 0;
          if (d <= r || torn) v = v < 128 ? 225 : 25;
        }
        sum += v;
      }
      const v = Math.round(sum / 4) + (hash32(x, y, s.seed) % 9) - 4;
      out[y * s.width + x] = Math.min(255, Math.max(0, v));
    }
  }
  return out;
}

const SCENES: readonly Scene[] = [
  {
    name: 'whole target, square on',
    lock: 'disc',
    width: 1600,
    height: 1400,
    cx: 800,
    cy: 700,
    pxPerMm: 2.6,
    seed: 1,
    holes: [
      [3, 4],
      [-20, 8],
      [37, -30],
      [-60, -45],
      [10, 85],
      [120, 30],
      [-150, -40],
    ],
    toleranceMm: 0.5,
  },
  {
    name: 'whole target, turned and tilted',
    lock: 'disc',
    width: 1600,
    height: 1400,
    cx: 820,
    cy: 680,
    pxPerMm: 2.4,
    rotDeg: 12,
    aniso: 0.96,
    tilt: 0.0001,
    seed: 2,
    holes: [
      [-5, 2],
      [30, 30],
      [62, -10],
      [-40, 60],
      [-85, -20],
      [140, 90],
    ],
    toleranceMm: 3,
  },
  {
    name: 'close-up, turned and tilted',
    lock: 'closeup',
    width: 1536,
    height: 1152,
    cx: 760,
    cy: 580,
    pxPerMm: 5.5,
    rotDeg: -6,
    aniso: 0.97,
    tilt: 0.0003,
    seed: 3,
    holes: [
      [2, -3],
      [18, 12],
      [-35, 20],
      [55, -40],
      [85, 15],
      [-70, -60],
    ],
    toleranceMm: 1,
  },
  {
    name: 'milsnabb, slightly turned',
    lock: 'milsnabb',
    width: 1600,
    height: 1400,
    cx: 800,
    cy: 700,
    pxPerMm: 2.4,
    rotDeg: 3,
    seed: 4,
    holes: [
      [5, -10],
      [-30, 20],
      [70, 40],
      [-60, -100],
      [170, 120],
    ],
    toleranceMm: 0.5,
  },
];

const out = process.env.CV_REGRESSION_OUT;
if (out) writeFileSync(out, '');

test.each(SCENES)(
  '$name',
  async (s) => {
    const face = s.lock === 'milsnabb' ? SPSF_SNABBSKJUTNING_25M : SPSF_PISTOL_25M_PRECISION;
    const score = (radiusMm: number) =>
      scoreHole({ centerMm: { x: radiusMm, y: 0 }, caliberMm: CALIBER_MM }, face);
    const truth = s.holes.map(([x, y]) => Math.hypot(x, y)).sort((a, b) => a - b);
    // the scene itself: no hole closer to a ring edge than the tolerance allows
    for (const r of truth) expect(score(r).marginMm).toBeGreaterThan(s.toleranceMm + 0.5);

    const cv = await loadOpenCv();
    const got = appCanvas(cv, { gray: render(s), width: s.width, height: s.height }, s.lock);
    if (typeof got === 'string') throw new Error(got);
    if (s.lock === 'disc') expect(got.note).toContain('gate pass');
    const found = proposeHoles(got.canvas, proposalFace(s.lock))
      .map((p) => Math.hypot(p.xMm, p.yMm))
      .sort((a, b) => a - b);

    const errors = found.map((r, i) => r - truth[i]!);
    if (out) {
      appendFileSync(
        out,
        `${JSON.stringify({
          scene: s.name,
          lock: s.lock,
          truthMm: truth.map((r) => +r.toFixed(2)),
          foundMm: found.map((r) => +r.toFixed(2)),
          errorMm: errors.map((e) => +e.toFixed(2)),
        })}\n`,
      );
    }
    expect(found).toHaveLength(truth.length);
    for (const e of errors) expect(Math.abs(e)).toBeLessThanOrEqual(s.toleranceMm);
    expect(found.map((r) => score(r).ringLabel)).toEqual(truth.map((r) => score(r).ringLabel));
  },
  300_000,
);
