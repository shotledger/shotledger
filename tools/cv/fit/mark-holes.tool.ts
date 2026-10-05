// Each photo's rectified canvas under a labelled grid, for reading hole
// centres off by eye. Ground truth is where the holes are, not which
// candidates a detector liked.
//
//   CV_MARK_IN=<photos> CV_MARK_OUT=<dir> [CV_MARK_ONLY=names.txt] \
//   [CV_MARK_LOCK=disc|closeup|milsnabb] [CV_MARK_LONG_SIDE=2048] \
//     pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts mark-holes
//
// (--silent=false shows the per-photo lines; vitest hides a passing test's output.)
// A 50 px grid, every 100 px intersection labelled in tens of px ("45,32" is
// x=450, y=320), on the canvas label-canvas.ts lays out. Each grid is a PNG
// beside a JSON sidecar holding the image px -> label px matrix.
//
// Photos, grids and marks are personal data: keep them outside the repo.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

import { expect, test } from 'vitest';

import { type Cv, loadOpenCv } from '../eval/opencv-js-disc-ops';
import { expandHome, type LabelCanvas, labelCanvas, loadPhoto, parseLock } from './label-canvas';

const GRID_PX = 50;
// RGB Mats: yellow lines, red every 100 px and on the labels.
const YELLOW = [255, 255, 0, 0];
const RED = [255, 0, 0, 0];

const pyMod = (a: number, n: number) => ((a % n) + n) % n;

/** 8-bit RGB PNG, unfiltered. */
function png(rgb: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The grid on `out`, labelled in the coordinates of a canvas `out` was
 *  cropped from at (x0, y0). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- an OpenCV.js Mat
function grid(cv: Cv, out: any, x0 = 0, y0 = 0): void {
  const { rows: h, cols: w } = out;
  const colour = (c: number[]) => new cv.Scalar(...c);
  for (let x = pyMod(-x0, GRID_PX); x < w; x += GRID_PX) {
    const c = pyMod(x + x0, 100) ? YELLOW : RED;
    cv.line(out, new cv.Point(x, 0), new cv.Point(x, h), colour(c), 1, cv.LINE_8, 0);
  }
  for (let y = pyMod(-y0, GRID_PX); y < h; y += GRID_PX) {
    const c = pyMod(y + y0, 100) ? YELLOW : RED;
    cv.line(out, new cv.Point(0, y), new cv.Point(w, y), colour(c), 1, cv.LINE_8, 0);
  }
  for (let x = pyMod(-x0, 100); x < w; x += 100) {
    for (let y = pyMod(-y0, 100); y < h; y += 100) {
      const text = `${Math.floor((x + x0) / 10)},${Math.floor((y + y0) / 10)}`;
      cv.putText(
        out,
        text,
        new cv.Point(x + 3, y + 14),
        cv.FONT_HERSHEY_SIMPLEX,
        0.35,
        colour(RED),
        1,
        cv.LINE_AA,
        false,
      );
    }
  }
}

const src = process.env.CV_MARK_IN;
const dst = process.env.CV_MARK_OUT;

test.skipIf(!src || !dst)('labelled grids for marking holes', async () => {
  const lock = parseLock(process.env.CV_MARK_LOCK ?? 'disc', 'CV_MARK_LOCK');
  const longSide = Number(process.env.CV_MARK_LONG_SIDE ?? 2048);
  const onlyPath = process.env.CV_MARK_ONLY;
  const only = onlyPath
    ? new Set(
        readFileSync(expandHome(onlyPath), 'utf8')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      )
    : null;
  const inDir = expandHome(src!);
  const outDir = expandHome(dst!);
  mkdirSync(outDir, { recursive: true });
  const cv = await loadOpenCv();
  let written = 0;
  for (const file of readdirSync(inDir)
    .filter((f) => /^[^.].*\.jp.*g$/.test(f))
    .sort()) {
    const name = file.replace(/\.[^.]*$/, '');
    if (only && !only.has(name)) continue;
    const photo = loadPhoto(cv, join(inDir, file), longSide);
    try {
      let out: LabelCanvas | string;
      try {
        out = labelCanvas(cv, photo.rgb, photo.gray, lock);
      } catch (error: unknown) {
        out = `${lock} lock failed (${error instanceof Error ? error.message : String(error)}); skipped`;
      }
      if (typeof out === 'string') {
        console.log(`${name} ${out}`);
        continue;
      }
      try {
        grid(cv, out.rgb, out.x0, out.y0);
        const { cols: width, rows: height } = out.rgb;
        writeFileSync(
          join(outDir, `${name}_grid.png`),
          png((out.rgb.data as Uint8Array).slice(), width, height),
        );
        writeFileSync(
          join(outDir, `${name}_grid.json`),
          JSON.stringify({
            photo: name,
            lock,
            imageWidth: photo.width,
            imageHeight: photo.height,
            imageToLabel: out.imageToLabel,
            // where the PNG sits in label px (a close-up's crop)
            x0: out.x0,
            y0: out.y0,
            centerXPx: out.centerXPx,
            centerYPx: out.centerYPx,
            pxPerMm: out.pxPerMm,
          }),
        );
        written += 1;
        console.log(`${name} ${width}x${height} ${out.note}`);
      } finally {
        out.rgb.delete();
      }
    } finally {
      photo.rgb.delete();
    }
  }
  expect(written).toBeGreaterThan(0);
});
