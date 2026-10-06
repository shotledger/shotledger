// Per photo both locks as the app runs them — the disc lock on OpenCV.js, the
// close-up lock on its pure ops — both held to the ring-offset yardstick,
// `chooseLock`'s pick, and the close-up's scale against the disc lock's.
//
//   CV_EVAL_IN=<dir of .pgm> CV_REAL_OUT=<out.jsonl> \
//     pnpm exec vitest run -c tools/cv/vitest.config.ts closeup-real
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import {
  chooseLock,
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
  ringOffsetMm,
} from '../../../app/src/features/photo-scoring/closeup-lock';
import { applyHomography, type Homography } from '../../../app/src/features/photo-scoring/corners';
import { invertHomography } from '../../../app/src/features/photo-scoring/transform';
import { runDisc } from './disc-run';
import { loadOpenCv } from './opencv-js-disc-ops';
import { readPgm } from './pgm';

const dir = process.env.CV_EVAL_IN;
const out = process.env.CV_REAL_OUT;

/** mm per image px of `toMm` near `at`. */
function localScale(toMm: Homography, at: { x: number; y: number }): number {
  const p = applyHomography(toMm, at);
  const px = applyHomography(toMm, { x: at.x + 1, y: at.y });
  const py = applyHomography(toMm, { x: at.x, y: at.y + 1 });
  return Math.sqrt(Math.abs((px.x - p.x) * (py.y - p.y) - (px.y - p.y) * (py.x - p.x)));
}

/** Share of the mm circle of radius R inside the photo. */
function inFrame(toMm: Homography, R: number, width: number, height: number): number {
  const toImage = invertHomography(toMm);
  if (!toImage) return 0;
  let n = 0;
  for (let i = 0; i < 360; i += 1) {
    const a = (2 * Math.PI * i) / 360;
    const q = applyHomography(toImage, { x: R * Math.cos(a), y: R * Math.sin(a) });
    if (q.x >= 0 && q.x < width && q.y >= 0 && q.y < height) n += 1;
  }
  return n / 360;
}

/**
 * How far `other`'s rings sit from `ref`'s: points on ref's 25/50/75 mm
 * circles that fall inside the photo, measured in other's mm. Per ring the
 * median and the 95th percentile of |r - R|; the worst ring of each.
 */
function ringAgreement(
  ref: Homography,
  other: Homography,
  width: number,
  height: number,
): { median: number; p95: number } | null {
  const toImage = invertHomography(ref);
  if (!toImage) return null;
  let median = -1;
  let p95 = -1;
  for (const R of [25, 50, 75]) {
    const d: number[] = [];
    for (let i = 0; i < 180; i += 1) {
      const a = (2 * Math.PI * i) / 180;
      const q = applyHomography(toImage, { x: R * Math.cos(a), y: R * Math.sin(a) });
      if (q.x < 0 || q.x >= width || q.y < 0 || q.y >= height) continue;
      const m = applyHomography(other, q);
      d.push(Math.abs(Math.hypot(m.x, m.y) - R));
    }
    if (d.length < 54) continue; // under 30% of the circle in frame
    d.sort((x, y) => x - y);
    median = Math.max(median, d[Math.floor(d.length / 2)]!);
    p95 = Math.max(p95, d[Math.min(d.length - 1, Math.floor(0.95 * d.length))]!);
  }
  return median < 0 ? null : { median, p95 };
}

const round = (v: number | null | undefined, digits: number) =>
  v === null || v === undefined ? null : Number(v.toFixed(digits));

test.skipIf(!dir || !out)('both locks on every PGM', async () => {
  const cv = await loadOpenCv();
  const lines: string[] = [];
  for (const name of readdirSync(dir!)
    .filter((f) => f.endsWith('.pgm'))
    .sort()) {
    const gray = readPgm(join(dir!, name));
    const disc = runDisc(cv, gray);
    const discToMm = disc.validity?.valid && disc.toMm ? disc.toMm : undefined;
    const t0 = performance.now();
    const work = closeupWorkImage(gray);
    const closeup = lockCloseupWork(work);
    const ms = performance.now() - t0;
    const discOffsetMm = discToMm ? ringOffsetMm(work, discToMm) : null;
    const chosen = chooseLock({ discPasses: !!discToMm, discOffsetMm, closeup, discToMm });
    const row: Record<string, unknown> = {
      photo: name.replace(/\.pgm$/, ''),
      disc: discToMm ? 'pass' : 'fail',
      discReasons: disc.validity?.reasons ?? disc.error,
      discOff: round(discOffsetMm, 2),
      // the disc lock's gate: how far the 9 and 8 lines are from its rings
      discDrift: round(disc.result?.metrics.ringDriftMm, 2),
      // the same yardstick on the disc lock's canvas mapping (disc-run.ts)
      discCanvasOff: round(disc.canvasToMm && ringOffsetMm(work, disc.canvasToMm), 2),
      closeup: closeup === null ? 'none' : passesCloseupGate(closeup) ? 'pass' : 'fail',
      closeupOff: round(closeup?.ringOffsetMm, 2),
      resid: round(closeup?.residualMm, 2),
      comb: round(closeup?.comb, 1),
      rings: closeup?.rings ?? null,
      discMs: Math.round(disc.ms),
      closeupMs: Math.round(ms),
      chosen,
    };
    if (discToMm && closeup) {
      const ratio = localScale(closeup.toMm, closeup.center) / localScale(discToMm, closeup.center);
      const c = applyHomography(discToMm, closeup.center);
      row.centreGapMm = round(Math.hypot(c.x, c.y), 2);
      row.scaleRatio = round(ratio, 3);
      // chooseLock's SCALE_VETO and SCALE_VETO_TOL
      row.vetoed =
        passesCloseupGate(closeup) &&
        [1 / 2, 1 / 3, 1 / 4].some((f) => Math.abs(ratio / f - 1) <= 0.06);
      // the disc lock's error, where the close-up lock is a trustworthy
      // reference: passing, at the disc's scale, and tight on the lines
      if (
        passesCloseupGate(closeup) &&
        Math.abs(ratio - 1) <= 0.03 &&
        (closeup.ringOffsetMm ?? Infinity) <= 0.3
      ) {
        const err = ringAgreement(closeup.toMm, discToMm, gray.width, gray.height);
        row.discErrMedianMm = round(err?.median, 2);
        row.discErrP95Mm = round(err?.p95, 2);
      }
    }
    const chosenToMm =
      chosen === 'disc' ? discToMm : chosen === 'closeup' ? closeup?.toMm : undefined;
    if (chosenToMm) row.ring7InFrame = round(inFrame(chosenToMm, 100, gray.width, gray.height), 2);
    lines.push(JSON.stringify(row));
  }
  writeFileSync(out!, lines.join('\n') + '\n');
  expect(lines.length).toBeGreaterThan(0);
});
