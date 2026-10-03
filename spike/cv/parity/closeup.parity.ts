// The app's close-up lock (closeup-lock.ts, pure ops) on real photos, for a
// side-by-side with the Python reference (parity_closeup.py). Both read the
// same greyscale PGMs, so a difference is the algorithm, not the decoder.
//
//   CV_PARITY_IN=<dir of .pgm> CV_PARITY_OUT=<out.jsonl> \
//     pnpm exec vitest run -c spike/cv/parity/vitest.config.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import {
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
} from '../../../app/src/features/photo-scoring/closeup-lock';

/** Binary greyscale PGM (P5, maxval 255). */
function readPgm(path: string) {
  const buf = readFileSync(path);
  let pos = 0;
  const fields: string[] = [];
  while (fields.length < 4) {
    while (/\s/.test(String.fromCharCode(buf[pos]!))) pos += 1;
    if (buf[pos] === 0x23) {
      while (buf[pos] !== 0x0a) pos += 1;
      continue;
    }
    let token = '';
    while (!/\s/.test(String.fromCharCode(buf[pos]!))) token += String.fromCharCode(buf[pos++]!);
    fields.push(token);
  }
  pos += 1; // the single whitespace before the raster
  const [magic, w, h, max] = fields;
  if (magic !== 'P5' || max !== '255') throw new Error(`${path}: not an 8-bit P5 PGM`);
  const width = Number(w);
  const height = Number(h);
  return { width, height, data: new Uint8Array(buf.buffer, buf.byteOffset + pos, width * height) };
}

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
