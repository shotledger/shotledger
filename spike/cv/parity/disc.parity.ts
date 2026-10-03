// The app's disc lock (disc-lock.ts on OpenCV.js) on real photos, for a
// side-by-side with target_cv.py (parity_disc.py). Both read the same
// greyscale PGMs, so a difference is the algorithm or the OpenCV build, not
// the decoder.
//
//   CV_PARITY_IN=<dir of .pgm> CV_DISC_OUT=<out.jsonl> \
//     pnpm exec vitest run -c spike/cv/parity/vitest.config.ts disc
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import { runDisc } from './disc-run';
import { loadOpenCv } from './opencv-js-disc-ops';
import { readPgm } from './pgm';

const dir = process.env.CV_PARITY_IN;
const out = process.env.CV_DISC_OUT;

test.skipIf(!dir || !out)('disc lock on every PGM', async () => {
  const cv = await loadOpenCv();
  const lines: string[] = [];
  for (const name of readdirSync(dir!)
    .filter((f) => f.endsWith('.pgm'))
    .sort()) {
    const run = runDisc(cv, readPgm(join(dir!, name)));
    lines.push(
      JSON.stringify({
        photo: name.replace(/\.pgm$/, ''),
        ms: Math.round(run.ms),
        error: run.error,
        toMm: run.toMm,
        canvasToMm: run.canvasToMm,
        canvas: run.result && {
          size: run.result.canvas.size,
          centerXPx: run.result.canvas.centerXPx,
          centerYPx: run.result.canvas.centerYPx,
          pxPerMm: run.result.canvas.pxPerMm,
        },
        ellipse: run.result?.ellipse ?? null,
        metrics: run.result?.metrics ?? null,
        valid: run.validity?.valid ?? false,
        reasons: run.validity?.reasons ?? null,
      }),
    );
  }
  writeFileSync(out!, lines.join('\n') + '\n');
  expect(lines.length).toBeGreaterThan(0);
});
