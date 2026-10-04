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
import { crops, MIL_OUTER, MIL_VIEWS, mul, photoSeed, PRE_OUTER, PRE_VIEWS, rng } from './crops';
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

/** Face rings outside the centre card, read through a card lock. */
const FACE_RINGS_MM = [170, 210] as const;
const REF_RADIUS_MM = 90;

const round = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? null : Number(v.toFixed(d));

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
    rings: lock.rings,
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
    const random = rng(photoSeed(photo));
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
