// Where the hole-size check's time goes on a close-up lock's canvas: per
// detector run, the maps and peaks, the part of them a device hands to OpenCV
// (`ops`, timed through the MapOps), and the per-peak features. Reads the
// canvases holes-prep.tool.ts writes with CV_PREP_LOCK=closeup;
// hole-size-timing.mts summarises the lines.
//
//   CV_TIMING_IN=<canvas dir> CV_TIMING_OUT=<out.jsonl> [CV_TIMING_ONLY=names.txt] \
//   [CV_TIMING_CALIBER=5.6] [CV_TIMING_HALVE=1] \
//     pnpm exec vitest run -c tools/cv/vitest.config.ts [--execArgv=--jitless] hole-size-timing
//
// Under --jitless the per-peak features take about what they take on a phone
// (#648); the OpenCV calls there are pure JS and far slower than on a phone,
// hence `ops`. CV_TIMING_HALVE also runs the check on the canvas at half its
// size, to see what a smaller canvas changes. Output names photos: keep it
// outside the repo.
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import { SPSF_PISTOL_25M_PRECISION } from '../../../shared/src/target-scoring/targets';
import {
  type DetectorTimings,
  HOLE_PROPOSAL_THRESHOLD,
  holeCandidates,
  type MapOps,
  pureMapOps,
} from '../../../app/src/features/photo-scoring/hole-proposals';
import { holeSizeCheck } from '../../../app/src/features/photo-scoring/precision-guards';
import type { RectifiedCanvas } from '../../../app/src/features/photo-scoring/tap-snap';

import { readPgm } from './pgm';

const dir = process.env.CV_TIMING_IN;
const out = process.env.CV_TIMING_OUT;

/** pureMapOps with the time spent inside them added to `opsMs`. */
let opsMs = 0;
const timedOps = Object.fromEntries(
  Object.entries(pureMapOps).map(([name, op]) => [
    name,
    (...args: unknown[]) => {
      const t = performance.now();
      try {
        return (op as (...a: unknown[]) => unknown)(...args);
      } finally {
        opsMs += performance.now() - t;
      }
    },
  ]),
) as unknown as MapOps;

/** The canvas at half its size, 2x2 means, as a smaller rectify would give. */
function halved(c: RectifiedCanvas): RectifiedCanvas {
  const s = c.size >> 1;
  const data = new Uint8Array(s * s);
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      const i = 2 * y * c.size + 2 * x;
      const sum =
        (c.data[i] as number) +
        (c.data[i + 1] as number) +
        (c.data[i + c.size] as number) +
        (c.data[i + c.size + 1] as number);
      data[y * s + x] = Math.round(sum / 4);
    }
  }
  return {
    data,
    size: s,
    centerXPx: c.centerXPx / 2,
    centerYPx: c.centerYPx / 2,
    pxPerMm: c.pxPerMm / 2,
  };
}

function timedCheck(canvas: RectifiedCanvas, caliberMm: number) {
  const runs: object[] = [];
  const t0 = performance.now();
  const check = holeSizeCheck(canvas, SPSF_PISTOL_25M_PRECISION, caliberMm, (c, f, scope) => {
    const t = {} as DetectorTimings;
    opsMs = 0;
    const found = holeCandidates(c, f, timedOps, t, scope);
    runs.push({
      caliberMm: f.caliberMm,
      mapsMs: Math.round(t.mapsMs),
      peaksMs: Math.round(t.peaksMs),
      opsMs: Math.round(opsMs),
      featuresMs: Math.round(t.featuresMs),
      peaks: t.peaks,
      kept: found.length,
    });
    return found;
  });
  return {
    ms: Math.round(performance.now() - t0),
    tooSmall: check.tooSmall,
    halfRun: check.halfRun,
    confident: check.candidates.filter((c) => c.probability >= HOLE_PROPOSAL_THRESHOLD).length,
    runs,
  };
}

test.skipIf(!dir || !out)('the hole-size check, timed per detector stage', () => {
  const caliberMm = Number(process.env.CV_TIMING_CALIBER ?? 5.6);
  const onlyPath = process.env.CV_TIMING_ONLY;
  const only = onlyPath
    ? new Set(readFileSync(onlyPath, 'utf8').split(/\s+/).filter(Boolean))
    : null;
  let timed = 0;
  for (const file of readdirSync(dir!)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const side = JSON.parse(readFileSync(join(dir!, file), 'utf8')) as {
      photo: string;
      centerXPx: number;
      centerYPx: number;
      pxPerMm: number;
    };
    if (only && !only.has(side.photo)) continue;
    const pgm = readPgm(join(dir!, `${side.photo}.pgm`));
    const canvas: RectifiedCanvas = {
      data: pgm.data,
      size: pgm.width,
      centerXPx: side.centerXPx,
      centerYPx: side.centerYPx,
      pxPerMm: side.pxPerMm,
    };
    const row = {
      photo: side.photo,
      size: canvas.size,
      full: timedCheck(canvas, caliberMm),
      ...(process.env.CV_TIMING_HALVE ? { halved: timedCheck(halved(canvas), caliberMm) } : {}),
    };
    appendFileSync(out!, `${JSON.stringify(row)}\n`);
    timed += 1;
  }
  expect(timed).toBeGreaterThan(0);
});
