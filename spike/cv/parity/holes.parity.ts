// The app's hole proposals (hole-proposals.ts, pure ops) on real rectified
// canvases, for a side-by-side with the Python reference (parity_holes.py).
// Both read the same PGM and take the face from its JSON sidecar, both written
// by `parity_holes.py prep`, so a difference is the algorithm.
//
//   CV_PARITY_IN=<canvas dir> CV_PARITY_OUT=<out.jsonl> \
//     pnpm exec vitest run -c spike/cv/parity/vitest.config.ts holes
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import {
  holeCandidates,
  proposeHoles,
  type ProposalFace,
} from '../../../app/src/features/photo-scoring/hole-proposals';
import type { RectifiedCanvas } from '../../../app/src/features/photo-scoring/tap-snap';

import { readPgm } from './pgm';

interface Sidecar {
  readonly photo: string;
  readonly centerXPx: number;
  readonly centerYPx: number;
  readonly pxPerMm: number;
  readonly caliberMm: number;
  readonly blackRadiusMm: number;
  readonly maxRadiusMm: number;
  readonly ringRadiiMm: readonly number[];
}

test('hole proposals on every canvas', () => {
  const dir = process.env.CV_PARITY_IN;
  const out = process.env.CV_PARITY_OUT;
  if (!dir || !out) throw new Error('set CV_PARITY_IN and CV_PARITY_OUT');
  const lines: string[] = [];
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const side = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Sidecar;
    const pgm = readPgm(join(dir, `${side.photo}.pgm`));
    if (pgm.width !== pgm.height) throw new Error(`${side.photo}: canvas is not square`);
    const canvas: RectifiedCanvas = {
      data: pgm.data,
      size: pgm.width,
      centerXPx: side.centerXPx,
      centerYPx: side.centerYPx,
      pxPerMm: side.pxPerMm,
    };
    const face: ProposalFace = {
      caliberMm: side.caliberMm,
      blackRadiusMm: side.blackRadiusMm,
      maxRadiusMm: side.maxRadiusMm,
      ringRadiiMm: side.ringRadiiMm,
    };
    // proposeHoles recomputes the candidates; it is timed as the app calls it
    const t0 = performance.now();
    const candidates = holeCandidates(canvas, face);
    const t1 = performance.now();
    const proposals = proposeHoles(canvas, face);
    const t2 = performance.now();
    lines.push(
      JSON.stringify({
        photo: side.photo,
        side,
        msCandidates: Math.round(t1 - t0),
        msPropose: Math.round(t2 - t1),
        candidates: candidates.map((c) => ({
          x: c.x,
          y: c.y,
          resp: c.resp,
          p: c.probability,
          f: c.features,
        })),
        proposals: proposals.map((p) => ({
          x: p.xMm * canvas.pxPerMm + canvas.centerXPx,
          y: p.yMm * canvas.pxPerMm + canvas.centerYPx,
          p: p.probability,
          peakX: p.peakX,
          peakY: p.peakY,
        })),
      }),
    );
  }
  writeFileSync(out, lines.join('\n') + '\n');
  expect(lines.length).toBeGreaterThan(0);
});
