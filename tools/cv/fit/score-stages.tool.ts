// The hole/patch filter's training data: every proposal stage scored against
// hand marks on the disc-lock canvas the marks were read off (mark-holes),
// with each candidate's texture features. See score-stages.ts.
//
//   CV_SCORE_MARKS=marks.txt CV_SCORE_IN=<photos> CV_SCORE_OUT=candidates.csv \
//   [CV_SCORE_LONG_SIDE=2048] \
//     pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts score-stages
//
// A photo is `<name>.jpg` in CV_SCORE_IN. Marks, photos and the CSV name real
// photos: keep them outside the repo.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import { loadOpenCv } from '../eval/opencv-js-disc-ops';
import { expandHome, labelCanvas, loadPhoto } from './label-canvas';
import { csvText, readMarks, scorePhoto } from './score-stages';

const marksPath = process.env.CV_SCORE_MARKS;
const src = process.env.CV_SCORE_IN;
const dst = process.env.CV_SCORE_OUT;

test.skipIf(!marksPath || !src || !dst)('proposal stages against hand marks', async () => {
  const longSide = Number(process.env.CV_SCORE_LONG_SIDE ?? 2048);
  const cv = await loadOpenCv();
  const rows: string[][] = [];
  for (const [name, holes] of readMarks(marksPath!)) {
    const photo = loadPhoto(cv, join(expandHome(src!), `${name}.jpg`), longSide);
    try {
      const canvas = labelCanvas(cv, photo.rgb, photo.gray, 'disc');
      if (typeof canvas === 'string') throw new Error(`${name}: ${canvas}`);
      try {
        rows.push(
          ...scorePhoto(
            cv,
            name,
            {
              rgb: (canvas.rgb.data as Uint8Array).slice(),
              width: canvas.rgb.cols,
              height: canvas.rgb.rows,
              centerXPx: canvas.centerXPx,
              centerYPx: canvas.centerYPx,
              pxPerMm: canvas.pxPerMm,
            },
            holes,
          ),
        );
      } finally {
        canvas.rgb.delete();
      }
    } finally {
      photo.rgb.delete();
    }
    console.log(`${name} holes=${holes.length}`);
  }
  writeFileSync(expandHome(dst!), csvText(rows));
  console.log(`wrote ${dst} ${rows.length}`);
  expect(rows.length).toBeGreaterThan(0);
});
