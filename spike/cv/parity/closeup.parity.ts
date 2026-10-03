// The app's close-up lock (closeup-lock.ts, pure ops) on real photos, for a
// side-by-side with the Python reference (parity_closeup.py). Both read the
// same greyscale PGMs, so a difference is the algorithm, not the decoder.
//
//   CV_PARITY_IN=<dir of .pgm> CV_PARITY_OUT=<out.jsonl> \
//     pnpm exec vitest run -c spike/cv/parity/vitest.config.ts closeup
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import {
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
} from '../../../app/src/features/photo-scoring/closeup-lock';

import { readPgm } from './pgm';

test('close-up lock on every PGM', () => {
  const dir = process.env.CV_PARITY_IN;
  const out = process.env.CV_PARITY_OUT;
  if (!dir || !out) throw new Error('set CV_PARITY_IN and CV_PARITY_OUT');
  const lines: string[] = [];
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith('.pgm'))
    .sort()) {
    const t0 = performance.now();
    const lock = lockCloseupWork(closeupWorkImage(readPgm(join(dir, name))));
    lines.push(
      JSON.stringify({
        photo: name.replace(/\.pgm$/, ''),
        ms: Math.round(performance.now() - t0),
        lock: lock && {
          toMm: lock.toMm,
          residualMm: lock.residualMm,
          comb: lock.comb,
          ringOffsetMm: lock.ringOffsetMm,
          rings: lock.rings,
          passes: passesCloseupGate(lock),
        },
      }),
    );
  }
  writeFileSync(out, lines.join('\n') + '\n');
  expect(lines.length).toBeGreaterThan(0);
});
