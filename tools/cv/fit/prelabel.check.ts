// CV_MARK_PRELABEL's marks land on the holes of the grid a human corrects
// them on: the proposals run on the app's canvas, the grid is label-canvas.ts's,
// and the two differ by a crop (disc) or not at all (close-up, milsnabb).
// Synthetic photos only (hard rule 7).
//
//   pnpm exec vitest run -c tools/cv/vitest.config.ts prelabel.check
import { expect, test } from 'vitest';

import { loadOpenCv } from '../eval/opencv-js-disc-ops';
import { labelCanvas, type Lock } from './label-canvas';
import { prelabelHoles } from './prelabel';

const PPMM = 2.6;
const SIZE = 1300;
const CENTRE = SIZE / 2;
const HOLE_R_MM = 2.8;

/** Holes, target mm: white in the black, dark on the paper. */
type Hole = readonly [number, number];

function scene(face: (X: number, Y: number) => number, holes: readonly Hole[]) {
  const rgb = new Uint8Array(SIZE * SIZE * 3);
  const gray = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const X = (x - CENTRE) / PPMM;
      const Y = (y - CENTRE) / PPMM;
      let v = face(X, Y);
      if (holes.some(([hx, hy]) => Math.hypot(X - hx, Y - hy) <= HOLE_R_MM)) {
        v = v < 128 ? 235 : 20;
      }
      gray[y * SIZE + x] = v;
      rgb.fill(v, (y * SIZE + x) * 3, (y * SIZE + x) * 3 + 3);
    }
  }
  return { rgb, gray };
}

// the precision face: black to 100 mm, white ring lines inside it every 25 mm
const precision = (X: number, Y: number) => {
  const r = Math.hypot(X, Y);
  if (r > 100) return 225;
  return [25, 50, 75].some((R) => r <= R && r >= R - 0.6) ? 205 : 30;
};

// label-canvas.check.ts's milsnabb scene
const milsnabb = (X: number, Y: number) => {
  const onCard = Math.abs(X) <= 140 && Math.abs(Y) <= 140 && Math.abs(X) + Math.abs(Y) <= 240;
  const r = Math.hypot(X, Y);
  if (onCard) return [25, 50, 90, 130].some((R) => r <= R && r >= R - 1) ? 205 : 48;
  return r > 250 ? 225 : 36;
};

async function prelabelsAgainstHoles(
  lock: Lock,
  face: (X: number, Y: number) => number,
  holes: Hole[],
) {
  const cv = await loadOpenCv();
  const { rgb, gray } = scene(face, holes);
  const mat = cv.matFromArray(SIZE, SIZE, cv.CV_8UC3, rgb);
  try {
    const grid = labelCanvas(cv, mat, gray, lock);
    if (typeof grid === 'string') throw new Error(grid);
    grid.rgb.delete();
    // where the grid shows each hole: its photo px through the grid's matrix
    const h = grid.imageToLabel;
    const expected = holes.map(([X, Y]) => {
      const x = X * PPMM + CENTRE;
      const y = Y * PPMM + CENTRE;
      const w = h[6]! * x + h[7]! * y + h[8]!;
      return [(h[0]! * x + h[1]! * y + h[2]!) / w, (h[3]! * x + h[4]! * y + h[5]!) / w];
    });
    // a low threshold: a drawn hole is not what the classifier was fitted on
    const marks = prelabelHoles(cv, { gray, width: SIZE, height: SIZE }, lock, 0.01);
    if (typeof marks === 'string') throw new Error(marks);
    return expected.map(([ex, ey]) =>
      Math.min(...marks.map((m) => Math.hypot(m.x - ex!, m.y - ey!))),
    );
  } finally {
    mat.delete();
  }
}

test('disc lock: pre-labels sit on the holes of the 1040 px grid', async () => {
  const off = await prelabelsAgainstHoles('disc', precision, [
    [10, -5],
    [-40, 30],
    [60, 60],
  ]);
  // 4 px/mm: within a millimetre of every hole
  for (const d of off) expect(d).toBeLessThan(4);
}, 120_000);

test('milsnabb lock: pre-labels sit on the holes of the full-canvas grid', async () => {
  const off = await prelabelsAgainstHoles('milsnabb', milsnabb, [
    [10, -5],
    [-60, 30],
    [170, 120],
  ]);
  for (const d of off) expect(d).toBeLessThan(4);
}, 120_000);
