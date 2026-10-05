// The rectified canvases holes.eval.ts reads: per photo the app's 2100 px
// grey canvas as a PGM, plus a JSON sidecar with its centre, scale and face.
// The canvas is the one the app hands the hole proposals: the disc lock's
// (runDiscLock on OpenCV.js) or, with CV_PREP_LOCK=closeup, the close-up
// lock's through rectifyWithHomography, as scan.tsx does. With
// CV_PREP_LOCK=milsnabb the milsnabb lock's, and the sidecar carries the
// milsnabb face (black to 250 mm) instead of the precision one.
//
//   CV_PREP_IN=<photos> CV_PREP_OUT=<canvas dir> [CV_PREP_LOCK=disc|closeup|milsnabb] \
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

import { expandHome, loadPhoto, parseLock } from '../fit/label-canvas';
import { appCanvas, labelShift, proposalFace } from './app-canvas';
import { loadOpenCv } from './opencv-js-disc-ops';

const src = process.env.CV_PREP_IN;
const dst = process.env.CV_PREP_OUT;

test.skipIf(!src || !dst)('rectified canvases for the hole proposals', async () => {
  const lock = parseLock(process.env.CV_PREP_LOCK ?? 'disc', 'CV_PREP_LOCK');
  const face = proposalFace(lock);
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
    let prepared;
    try {
      prepared = appCanvas(cv, photo, lock);
    } finally {
      photo.rgb.delete();
    }
    if (typeof prepared === 'string') {
      console.log(`${name}: ${prepared}`);
      continue;
    }
    const { canvas, note } = prepared;
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
        shift: labelShift(lock),
        ...face,
      }),
    );
    ready += 1;
    console.log(`${name}: prepared, ${note}`);
  }
  expect(ready).toBeGreaterThan(0);
});
