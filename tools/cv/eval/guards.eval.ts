// The precision close-up lock's three milsnabb guards on real photos: the
// lock's perspective over the photo, the milsnabb lock passing on the same
// photo, and the holes' size against the calibre (precision-guards.ts). Not
// part of `pnpm check`: the photos live outside the repo
// (docs/specs/cv-closeup-lock-2026-09.md, last section).
//
//   CV_GUARD_SETS=<tsv: pgm path, set, framing, face> CV_GUARD_OUT=<out.jsonl> \
//   [CV_GUARD_SHARD=i/n] [CV_GUARD_CROPS=1] \
//     pnpm exec vitest run -c tools/cv/vitest.config.ts guards.eval
//
// Per milsnabb photo: the whole photo, and with crops the milsnabb.eval.ts
// crops around its milsnabb lock (the same pixels). Per precision photo: the
// whole photo, and with crops the precision views around its disc lock. Every
// image whose precision close-up lock passes its gate gets a row with
// chooseLock's pick against the disc lock (the guards run in scan.tsx only on
// 'closeup'), the guards' readings and verdict (`refusedBy`), and the raw
// candidates behind the hole reading; the rest get a row saying it did not
// pass. CV_GUARD_DUMP=<dir> writes each guarded canvas as a PGM.
import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { SPSF_PISTOL_25M_PRECISION } from '../../../shared/src/target-scoring/targets';
import {
  chooseLock,
  closeupWorkImage,
  type GrayImage,
  lockCloseupWork,
  passesCloseupGate,
  ringOffsetMm,
} from '../../../app/src/features/photo-scoring/closeup-lock';
import { rectifyWithHomography } from '../../../app/src/features/photo-scoring/disc-lock';
import {
  holeCandidates,
  MERGE_RADIUS_D,
  type ProposalFace,
} from '../../../app/src/features/photo-scoring/hole-proposals';
import type { RectifiedCanvas } from '../../../app/src/features/photo-scoring/tap-snap';
import {
  lockMilsnabbWork,
  passesMilsnabbGate,
} from '../../../app/src/features/photo-scoring/milsnabb-lock';
import {
  holeDiametersMm,
  holesTooSmall,
  milsnabbLockRefuses,
  perspectiveRefuses,
  proposalFaceOf,
} from '../../../app/src/features/photo-scoring/precision-guards';
import { crops, MIL_OUTER, MIL_VIEWS, photoSeed, PRE_VIEWS, rng } from './crops';
import { type DiscRun, runDisc } from './disc-run';
import { type Cv, loadOpenCv, openCvJsDiscOps } from './opencv-js-disc-ops';
import { readPgm } from './pgm';

const sets = process.env.CV_GUARD_SETS;
const out = process.env.CV_GUARD_OUT;
const [shard, shards] = (process.env.CV_GUARD_SHARD ?? '0/1').split('/').map(Number) as [
  number,
  number,
];
const withCrops = process.env.CV_GUARD_CROPS === '1';
/** Writes each guarded canvas here as a PGM, for checking by eye. */
const dump = process.env.CV_GUARD_DUMP;
const nameOf = (photo: string, view: string, trial: number | string) =>
  `${photo}_${view.replace(/ /g, '')}_${trial}`;
const CALIBER_MM = 5.6;
const FACE = SPSF_PISTOL_25M_PRECISION;
/** The precision views of the close-up report. */
const PRECISION_VIEWS = PRE_VIEWS.slice(0, 3);

const round = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? null : Number(v.toFixed(d));

/** Every candidate above a low floor, merged as the guard merges them:
 *  [probability, blob diameter mm, x mm, y mm], for choosing the rule. */
function rawHoles(canvas: RectifiedCanvas, face: ProposalFace) {
  const d = face.caliberMm * canvas.pxPerMm;
  const kept: ReturnType<typeof holeCandidates> = [];
  for (const c of holeCandidates(canvas, face)
    .filter((c) => c.probability >= 0.3)
    .sort((a, b) => b.probability - a.probability)) {
    if (kept.some((k) => Math.hypot(c.x - k.x, c.y - k.y) < MERGE_RADIUS_D * d)) continue;
    kept.push(c);
  }
  return kept.map((c) => [
    round(c.probability, 3),
    round(face.caliberMm * Math.sqrt(c.features.b_area)),
    round((c.x - canvas.centerXPx) / canvas.pxPerMm, 1),
    round((c.y - canvas.centerYPx) / canvas.pxPerMm, 1),
  ]);
}

function guardRow(cv: Cv, image: GrayImage, name: string, known?: DiscRun) {
  const t0 = performance.now();
  const work = closeupWorkImage(image);
  const lock = lockCloseupWork(work);
  if (!passesCloseupGate(lock)) return { passes: false };
  // What scan.tsx does next: the guards run only when chooseLock picks this.
  const disc = known ?? runDisc(cv, image);
  const discToMm = disc.validity?.valid && disc.toMm ? disc.toMm : undefined;
  const choice = chooseLock({
    discPasses: !!discToMm,
    discOffsetMm: discToMm ? ringOffsetMm(work, discToMm) : null,
    closeup: lock,
    discToMm,
  });
  const mil = lockMilsnabbWork(work);
  const t1 = performance.now();
  const ops = openCvJsDiscOps(cv);
  let canvas;
  try {
    canvas = rectifyWithHomography(
      ops,
      ops.gray(image.data as Uint8Array, image.width, image.height),
      {
        toMm: lock.toMm,
        outerRadiusMm: Math.max(...FACE.rings.map((r) => r.diameterMm / 2)),
      },
    );
  } finally {
    ops.release();
  }
  if (dump) {
    writeFileSync(
      `${dump}/${name}.pgm`,
      Buffer.concat([Buffer.from(`P5\n${canvas.size} ${canvas.size}\n255\n`), canvas.data]),
    );
  }
  const face = proposalFaceOf(FACE, CALIBER_MM);
  const read = (caliberMm: number) =>
    holeDiametersMm(canvas, { ...face, caliberMm }, (c, f) => holeCandidates(c, f));
  const full = read(CALIBER_MM);
  const half = read(CALIBER_MM / 2);
  const raw = {
    full: rawHoles(canvas, face),
    half: rawHoles(canvas, { ...face, caliberMm: CALIBER_MM / 2 }),
  };
  const t2 = performance.now();
  // The mapping's projective denominator at the photo's corners, as is
  // ([8] = 1, so 1 at the photo's origin) and relative to the target centre's
  // (perspectiveRefuses): a sign change puts the horizon inside the photo.
  const [, , , , , , g, h] = lock.toMm as unknown as number[];
  const w = [0, image.width].flatMap((x) => [0, image.height].map((y) => g! * x + h! * y + 1));
  const wAtCenter = g! * lock.center.x + h! * lock.center.y + 1;
  const wc = w.map((v) => v / wAtCenter);
  const perspective = perspectiveRefuses(lock.toMm, lock.center, image);
  return {
    passes: true,
    choice,
    period: round(lock.period),
    wMin: round(Math.min(...w), 3),
    wMax: round(Math.max(...w), 3),
    wcMin: round(Math.min(...wc), 3),
    wcMax: round(Math.max(...wc), 3),
    perspective,
    milsnabb: mil
      ? {
          passes: passesMilsnabbGate(mil),
          lines: mil.ringLines,
          rings: mil.rings,
          support: round(mil.support),
          off: round(mil.ringOffsetMm),
          res: round(mil.residualMm),
          comb: round(mil.comb, 1),
          inFrame: mil.inFrame,
        }
      : null,
    holes: { full: full.map((d) => round(d)), half: half.map((d) => round(d)) },
    raw,
    // In scan.tsx's order.
    refusedBy: perspective
      ? 'perspective'
      : milsnabbLockRefuses(mil)
        ? 'milsnabbLock'
        : holesTooSmall(full, half, CALIBER_MM)
          ? 'holeSize'
          : null,
    msLocks: Math.round(t1 - t0),
    msHoles: Math.round(t2 - t1),
  };
}

test.skipIf(!sets || !out)('the precision close-up lock guards', async () => {
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
      emit({
        ...base,
        view: 'full',
        trial: 'full',
        ...guardRow(cv, gray, nameOf(photo, 'full', 'full')),
      });
      if (!withCrops) continue;
      const ref = lockMilsnabbWork(closeupWorkImage(gray));
      if (!passesMilsnabbGate(ref)) continue;
      for (const c of crops(gray, ref.toMm, MIL_VIEWS, MIL_OUTER, 3, random)) {
        emit({
          ...base,
          view: c.view,
          trial: c.trial,
          ...guardRow(cv, c.image, nameOf(photo, c.view, c.trial)),
        });
      }
    } else {
      const disc = runDisc(cv, gray);
      const discPasses = disc.validity?.valid === true;
      const whole = guardRow(cv, gray, nameOf(photo, 'full', 'full'), disc);
      emit({ ...base, view: 'full', trial: 'full', discPasses, ...whole });
      if (!withCrops || !discPasses || !disc.toMm) continue;
      for (const c of crops(gray, disc.toMm, PRECISION_VIEWS, [], 3, random)) {
        emit({
          ...base,
          view: c.view,
          trial: c.trial,
          ...guardRow(cv, c.image, nameOf(photo, c.view, c.trial)),
        });
      }
    }
  }
  expect(lines.length).toBeGreaterThan(0);
});
