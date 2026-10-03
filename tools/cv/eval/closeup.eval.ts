// The app's close-up lock (closeup-lock.ts, pure ops) on real photos: per
// greyscale PGM (prep.sh) the lock, its gate's numbers and its verdict.
// `diff.mts closeup` compares two runs, e.g. before and after a change.
//
//   CV_EVAL_IN=<dir of .pgm> CV_EVAL_OUT=<out.jsonl> \
//     pnpm exec vitest run -c tools/cv/vitest.config.ts closeup.eval
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import {
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
} from '../../../app/src/features/photo-scoring/closeup-lock';

import { readPgm } from './pgm';

const dir = process.env.CV_EVAL_IN;
const out = process.env.CV_EVAL_OUT;

test.skipIf(!dir || !out)('close-up lock on every PGM', () => {
  const lines: string[] = [];
  for (const name of readdirSync(dir!)
    .filter((f) => f.endsWith('.pgm'))
    .sort()) {
    const t0 = performance.now();
    const lock = lockCloseupWork(closeupWorkImage(readPgm(join(dir!, name))));
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
  writeFileSync(out!, lines.join('\n') + '\n');
  expect(lines.length).toBeGreaterThan(0);
});
