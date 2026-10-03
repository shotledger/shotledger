// The rectified canvases holes.eval.ts reads: per photo the app's 2100 px
// grey canvas as a PGM, plus a JSON sidecar with its centre, scale and face.
// The canvas is the one the app hands the hole proposals: the disc lock's
// (runDiscLock on OpenCV.js) or, with CV_PREP_LOCK=closeup, the close-up
// lock's through rectifyWithHomography, as scan.tsx does.
//
//   CV_PREP_IN=<photos> CV_PREP_OUT=<canvas dir> [CV_PREP_LOCK=disc|closeup] \
//   [CV_PREP_ONLY=names.txt] [CV_PREP_LONG_SIDE=2048] \
//     pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts holes-prep
//
// A photo is named by its file's stem, as in a marks file. `shift` in the
// sidecar moves a mark read off mark-holes' 1040 px disc canvas onto this
// one (0 for a close-up, whose grid is labelled in canvas px). An existing
// sidecar is kept, so an interrupted run resumes. Photos and canvases are
// personal data: keep them outside the repo.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import {
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
} from '../../../app/src/features/photo-scoring/closeup-lock';
import {
  rectifyWithHomography,
  runDiscLock,
} from '../../../app/src/features/photo-scoring/disc-lock';
import type { RectifiedCanvas } from '../../../app/src/features/photo-scoring/tap-snap';
import { checkGeometryValidity } from '../../../app/src/features/photo-scoring/validity';
import {
  CANVAS_PX,
  expandHome,
  FACE,
  loadPhoto,
  RING_RADII_MM,
  SPIKE_CANVAS_PX,
} from '../fit/label-canvas';
import { loadOpenCv, openCvJsDiscOps } from './opencv-js-disc-ops';

const CALIBER_MM = 5.6;
const src = process.env.CV_PREP_IN;
const dst = process.env.CV_PREP_OUT;

test.skipIf(!src || !dst)('rectified canvases for the hole proposals', async () => {
  const lock = process.env.CV_PREP_LOCK ?? 'disc';
  if (lock !== 'disc' && lock !== 'closeup') throw new Error(`CV_PREP_LOCK=${lock}`);
  const longSide = Number(process.env.CV_PREP_LONG_SIDE ?? 2048);
  const onlyPath = process.env.CV_PREP_ONLY;
  const only = onlyPath
    ? new Set(readFileSync(expandHome(onlyPath), 'utf8').split(/\s+/).filter(Boolean))
    : null;
  const inDir = expandHome(src!);
  const outDir = expandHome(dst!);
  mkdirSync(outDir, { recursive: true });
  const cv = await loadOpenCv();
  let ready = 0;
  for (const file of readdirSync(inDir)
    .filter((f) => /^[^.].*\.(jpe?g|png|heic)$/i.test(f))
    .sort()) {
    const name = file.replace(/\.[^.]*$/, '');
    if (only && !only.has(name)) continue;
    const sidecar = join(outDir, `${name}.json`);
    if (existsSync(sidecar)) {
      ready += 1;
      continue;
    }
    const photo = loadPhoto(cv, join(inDir, file), longSide);
    const ops = openCvJsDiscOps(cv);
    let canvas: RectifiedCanvas;
    let note: string;
    try {
      const gray = ops.gray(photo.gray, photo.width, photo.height);
      if (lock === 'closeup') {
        const closeup = lockCloseupWork(
          closeupWorkImage({ data: photo.gray, width: photo.width, height: photo.height }),
        );
        if (!passesCloseupGate(closeup)) {
          console.log(`${name}: close-up lock failed its gate; skipped`);
          continue;
        }
        canvas = rectifyWithHomography(ops, gray, {
          toMm: closeup.toMm,
          outerRadiusMm: RING_RADII_MM.at(-1)!,
        });
        note = 'close-up lock';
      } else {
        const result = runDiscLock(ops, gray, {
          width: photo.width,
          height: photo.height,
          referenceDiameterMm: FACE.referenceDiameterMm,
          ringRadiiMm: RING_RADII_MM,
        });
        canvas = result.canvas;
        const { valid, reasons } = checkGeometryValidity(result.metrics);
        note = `disc lock, gate ${valid ? 'pass' : reasons.join(',')}`;
      }
    } catch (error: unknown) {
      console.log(
        `${name}: ${lock} lock failed (${error instanceof Error ? error.message : String(error)}); skipped`,
      );
      continue;
    } finally {
      ops.release();
      photo.rgb.delete();
    }
    writeFileSync(
      join(outDir, `${name}.pgm`),
      Buffer.concat([Buffer.from(`P5\n${canvas.size} ${canvas.size}\n255\n`), canvas.data]),
    );
    writeFileSync(
      sidecar,
      JSON.stringify({
        photo: name,
        lock,
        size: canvas.size,
        centerXPx: canvas.centerXPx,
        centerYPx: canvas.centerYPx,
        pxPerMm: canvas.pxPerMm,
        shift: lock === 'disc' ? (CANVAS_PX - SPIKE_CANVAS_PX) / 2 : 0,
        caliberMm: CALIBER_MM,
        blackRadiusMm: FACE.referenceDiameterMm / 2,
        maxRadiusMm: RING_RADII_MM.at(-1)!,
        ringRadiiMm: RING_RADII_MM,
      }),
    );
    ready += 1;
    console.log(`${name}: prepared, ${note}`);
  }
  expect(ready).toBeGreaterThan(0);
});
