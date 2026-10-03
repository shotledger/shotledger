// mark_holes.py in TypeScript: each photo's rectified canvas under a labelled
// grid, for reading hole centres off by eye. Ground truth is where the holes
// are, not which candidates a detector liked.
//
//   CV_MARK_IN=<photos> CV_MARK_OUT=<dir> [CV_MARK_ONLY=names.txt] \
//   [CV_MARK_LOCK=disc|closeup] [CV_MARK_LONG_SIDE=2048] \
//     pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts mark-holes
//
// (--silent=false shows the per-photo lines; vitest hides a passing test's output.)
// A 50 px grid, every 100 px intersection labelled in tens of px ("45,32" is
// x=450, y=320). The canvas is the app's: the disc lock (disc-lock.ts on
// OpenCV.js) or, with CV_MARK_LOCK=closeup, the close-up lock (closeup-lock.ts),
// laid out as mark_holes.py lays out its own locks' canvases, so the marks
// keep their format:
//  * disc: the 1040 px square round the black zone (2.6 black radii at
//    4 px/mm, the spike's canvas), which is the app's 2100 px canvas less
//    530 px a side. Unrefined, as the Python's: the refinement moves the
//    centre and scale the scorer reads, not the pixels.
//  * closeup: the 2100 px canvas cropped to what the photo covers, labelled
//    in full-canvas px.
// Photos are decoded by ImageMagick (`magick`), as the parity prep does; the
// grey the locks see is OpenCV's BGR->grey, as on the device. Each grid is a
// PNG beside a JSON sidecar holding the image px -> label px matrix.
//
// Photos, grids and marks are personal data: keep them outside the repo.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

import { expect, test } from 'vitest';

import { buildRectification } from '../../../shared/src/target-scoring/geometry';
import { SPSF_PISTOL_25M_PRECISION } from '../../../shared/src/target-scoring/targets';
import {
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
} from '../../../app/src/features/photo-scoring/closeup-lock';
import {
  CANVAS_PX_PER_MM,
  canvasHomography,
  runDiscLock,
} from '../../../app/src/features/photo-scoring/disc-lock';
import { checkGeometryValidity } from '../../../app/src/features/photo-scoring/validity';
import { type Cv, loadOpenCv, openCvJsDiscOps } from '../eval/opencv-js-disc-ops';

const FACE = SPSF_PISTOL_25M_PRECISION;
const GRID_PX = 50;
const RING_RADII_MM = FACE.rings.map((ring) => ring.diameterMm / 2);
const CANVAS_PX = Math.round(
  2 * RING_RADII_MM[RING_RADII_MM.length - 1]! * 1.05 * CANVAS_PX_PER_MM,
);
/** target_cv.build_geom's canvas: 2.6 black-zone radii a side. */
const SPIKE_CANVAS_PX = Math.round(2.6 * (FACE.referenceDiameterMm / 2) * CANVAS_PX_PER_MM);
// Python's colours are BGR; these Mats are RGB.
const YELLOW = [255, 255, 0, 0];
const RED = [255, 0, 0, 0];

const expandHome = (p: string) => (p.startsWith('~/') ? homedir() + p.slice(1) : p);
const pyMod = (a: number, n: number) => ((a % n) + n) % n;

/** The photo at `longSide` px at most, EXIF-oriented, as 8-bit RGB. */
function decode(path: string, longSide: number) {
  const buf = execFileSync(
    'magick',
    [`${path}[0]`, '-auto-orient', '-resize', `${longSide}x${longSide}>`, '-depth', '8', 'ppm:-'],
    { maxBuffer: 1 << 30 },
  );
  const head = buf.subarray(0, 64).toString('latin1');
  const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(head);
  if (!m) throw new Error(`${path}: magick did not write an 8-bit P6`);
  const width = Number(m[1]);
  const height = Number(m[2]);
  return { width, height, rgb: buf.subarray(m[0].length, m[0].length + width * height * 3) };
}

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

/** mark_holes.grid: the grid on `out`, labelled in the coordinates of a
 *  canvas `out` was cropped from at (x0, y0). */
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

const mul3 = (a: readonly number[], b: readonly number[]) =>
  [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => a[3 * r]! * b[c]! + a[3 * r + 1]! * b[3 + c]! + a[3 * r + 2]! * b[6 + c]!),
  );

interface Rendered {
  /** The labelled image, RGB. */
  readonly rgb: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** Image px -> label px (the marks' coordinates). */
  readonly imageToLabel: number[];
  /** The target centre and scale the scorer reads, label px. */
  readonly centerXPx: number;
  readonly centerYPx: number;
  readonly pxPerMm: number;
  readonly note: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenCV.js Mats
function render(cv: Cv, rgb: any, gray: Uint8Array, lock: string): Rendered | string {
  const width = rgb.cols as number;
  const height = rgb.rows as number;
  const items: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(m: T) => (items.push(m), m);
  const white = new cv.Scalar(255, 255, 255, 255);
  const warp = (
    src: unknown,
    h: number[],
    w: number,
    hh: number,
    flags: number,
    border: unknown,
  ) => {
    const out = keep(new cv.Mat());
    const m = keep(cv.matFromArray(3, 3, cv.CV_64F, h));
    cv.warpPerspective(src, out, m, new cv.Size(w, hh), flags, cv.BORDER_CONSTANT, border);
    return out;
  };
  try {
    if (lock === 'closeup') {
      const closeup = lockCloseupWork(closeupWorkImage({ data: gray, width, height }));
      if (!passesCloseupGate(closeup)) return 'close-up lock failed its gate; skipped';
      const k = CANVAS_PX_PER_MM;
      const half = CANVAS_PX / 2;
      const h = mul3([k, 0, half, 0, k, half, 0, 0, 1], closeup.toMm);
      const big = warp(rgb, h, CANVAS_PX, CANVAS_PX, cv.INTER_CUBIC, white);
      // outside the photo is white paper to the detector; crop to what was photographed
      const ones = keep(new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(255)));
      const seen = warp(ones, h, CANVAS_PX, CANVAS_PX, cv.INTER_NEAREST, new cv.Scalar(0));
      const r = cv.boundingRect(seen);
      const crop = keep(big.roi(r).clone());
      grid(cv, crop, r.x, r.y);
      return {
        rgb: (crop.data as Uint8Array).slice(),
        width: r.width,
        height: r.height,
        imageToLabel: h,
        centerXPx: half,
        centerYPx: half,
        pxPerMm: k,
        note: 'close-up lock, 4 px/mm',
      };
    }
    const ops = openCvJsDiscOps(cv);
    try {
      const result = runDiscLock(ops, ops.gray(gray, width, height), {
        width,
        height,
        referenceDiameterMm: FACE.referenceDiameterMm,
        ringRadiiMm: RING_RADII_MM,
      });
      const shift = (CANVAS_PX - SPIKE_CANVAS_PX) / 2;
      const base = buildRectification(result.ellipse, FACE.referenceDiameterMm);
      const h = mul3([1, 0, -shift, 0, 1, -shift, 0, 0, 1], canvasHomography(base, CANVAS_PX));
      const out = warp(rgb, h, SPIKE_CANVAS_PX, SPIKE_CANVAS_PX, cv.INTER_CUBIC, white);
      grid(cv, out);
      // mark_holes.py renders whatever its lock found; the gate verdict says
      // whether the app would have accepted this canvas
      const { valid, reasons } = checkGeometryValidity(result.metrics);
      return {
        rgb: (out.data as Uint8Array).slice(),
        width: SPIKE_CANVAS_PX,
        height: SPIKE_CANVAS_PX,
        imageToLabel: h,
        centerXPx: result.canvas.centerXPx - shift,
        centerYPx: result.canvas.centerYPx - shift,
        pxPerMm: result.canvas.pxPerMm,
        note: `px_per_mm=${result.canvas.pxPerMm.toFixed(2)} gate=${valid ? 'pass' : reasons.join(',')}`,
      };
    } finally {
      ops.release();
    }
  } finally {
    for (const m of items.reverse()) m.delete();
  }
}

const src = process.env.CV_MARK_IN;
const dst = process.env.CV_MARK_OUT;

test.skipIf(!src || !dst)('labelled grids for marking holes', async () => {
  const lock = process.env.CV_MARK_LOCK ?? 'disc';
  if (lock !== 'disc' && lock !== 'closeup') throw new Error(`CV_MARK_LOCK=${lock}`);
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
  // glob('*.jp*g'), sorted
  for (const file of readdirSync(inDir)
    .filter((f) => /^[^.].*\.jp.*g$/.test(f))
    .sort()) {
    const name = file.replace(/\.[^.]*$/, '');
    if (only && !only.has(name)) continue;
    const photo = decode(join(inDir, file), longSide);
    const rgb = cv.matFromArray(photo.height, photo.width, cv.CV_8UC3, photo.rgb);
    const grayMat = new cv.Mat();
    try {
      cv.cvtColor(rgb, grayMat, cv.COLOR_RGB2GRAY);
      const gray = (grayMat.data as Uint8Array).slice();
      let out: Rendered | string;
      try {
        out = render(cv, rgb, gray, lock);
      } catch (error: unknown) {
        out = `${lock} lock failed (${error instanceof Error ? error.message : String(error)}); skipped`;
      }
      if (typeof out === 'string') {
        console.log(`${name} ${out}`);
        continue;
      }
      writeFileSync(join(outDir, `${name}_grid.png`), png(out.rgb, out.width, out.height));
      writeFileSync(
        join(outDir, `${name}_grid.json`),
        JSON.stringify({
          photo: name,
          lock,
          imageWidth: photo.width,
          imageHeight: photo.height,
          imageToLabel: out.imageToLabel,
          centerXPx: out.centerXPx,
          centerYPx: out.centerYPx,
          pxPerMm: out.pxPerMm,
        }),
      );
      written += 1;
      console.log(`${name} ${out.width}x${out.height} ${out.note}`);
    } finally {
      grayMat.delete();
      rgb.delete();
    }
  }
  expect(written).toBeGreaterThan(0);
});
