// The canvas hole marks are read off and scored on: a photo decoded by
// ImageMagick, locked by the app's disc lock (disc-lock.ts on OpenCV.js),
// close-up lock (closeup-lock.ts) or milsnabb lock (milsnabb-lock.ts), and
// warped in colour.
//  * disc: the 1040 px square round the black zone (2.6 black radii at
//    4 px/mm), which is the app's 2100 px canvas less 530 px a side.
//    Unrefined: the refinement moves the centre and scale the scorer reads,
//    not the pixels.
//  * closeup, milsnabb: the 2100 px canvas cropped to what the photo covers,
//    labelled in full-canvas px.
// The grey the locks see is OpenCV's RGB->grey, as on the device.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

import { buildRectification } from '../../../shared/src/target-scoring/geometry';
import {
  SPSF_PISTOL_25M_PRECISION,
  SPSF_SNABBSKJUTNING_25M,
} from '../../../shared/src/target-scoring/targets';
import {
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
} from '../../../app/src/features/photo-scoring/closeup-lock';
import {
  lockMilsnabbWork,
  passesMilsnabbGate,
} from '../../../app/src/features/photo-scoring/milsnabb-lock';
import {
  CANVAS_PX_PER_MM,
  canvasHomography,
  runDiscLock,
} from '../../../app/src/features/photo-scoring/disc-lock';
import { checkGeometryValidity } from '../../../app/src/features/photo-scoring/validity';
import { type Cv, openCvJsDiscOps } from '../eval/opencv-js-disc-ops';
import { pyRoundInt } from '../py-format';

export const FACE = SPSF_PISTOL_25M_PRECISION;
export const RING_RADII_MM = FACE.rings.map((ring) => ring.diameterMm / 2);
export const CANVAS_PX = Math.round(
  2 * RING_RADII_MM[RING_RADII_MM.length - 1]! * 1.05 * CANVAS_PX_PER_MM,
);
/** The disc canvas: 2.6 black-zone radii a side. */
export const SPIKE_CANVAS_PX = Math.round(2.6 * (FACE.referenceDiameterMm / 2) * CANVAS_PX_PER_MM);

export const LOCKS = ['disc', 'closeup', 'milsnabb'] as const;
export type Lock = (typeof LOCKS)[number];

export function parseLock(value: string, variable: string): Lock {
  const lock = LOCKS.find((l) => l === value);
  if (!lock) throw new Error(`${variable}=${value} (one of ${LOCKS.join(', ')})`);
  return lock;
}

/** What the hole proposals are told about the face a lock belongs to. */
export function faceFor(lock: Lock) {
  const face = lock === 'milsnabb' ? SPSF_SNABBSKJUTNING_25M : FACE;
  return {
    blackRadiusMm: face.referenceDiameterMm / 2,
    ringRadiiMm: face.rings.map((ring) => ring.diameterMm / 2),
  };
}

export const expandHome = (p: string) => (p.startsWith('~/') ? homedir() + p.slice(1) : p);

/** The photo at full size, EXIF-oriented, as 8-bit RGB. */
export function decode(path: string) {
  const buf = execFileSync('magick', [`${path}[0]`, '-auto-orient', '-depth', '8', 'ppm:-'], {
    maxBuffer: 1 << 30,
  });
  const head = buf.subarray(0, 64).toString('latin1');
  const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(head);
  if (!m) throw new Error(`${path}: magick did not write an 8-bit P6`);
  const width = Number(m[1]);
  const height = Number(m[2]);
  return { width, height, rgb: buf.subarray(m[0].length, m[0].length + width * height * 3) };
}

const mul3 = (a: readonly number[], b: readonly number[]) =>
  [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => a[3 * r]! * b[c]! + a[3 * r + 1]! * b[3 + c]! + a[3 * r + 2]! * b[6 + c]!),
  );

export interface LabelCanvas {
  /** The canvas, an RGB OpenCV.js Mat the caller deletes. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- an OpenCV.js Mat
  readonly rgb: any;
  /** Where the Mat sits in label px (a close-up's crop); 0 for the disc. */
  readonly x0: number;
  readonly y0: number;
  /** Image px -> label px (the marks' coordinates). */
  readonly imageToLabel: number[];
  /** The target centre and scale the scorer reads, label px. */
  readonly centerXPx: number;
  readonly centerYPx: number;
  readonly pxPerMm: number;
  readonly note: string;
}

/** The canvas of one photo, or why there is none. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenCV.js Mats
export function labelCanvas(cv: Cv, rgb: any, gray: Uint8Array, lock: Lock): LabelCanvas | string {
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
    const out = new cv.Mat();
    const m = keep(cv.matFromArray(3, 3, cv.CV_64F, h));
    cv.warpPerspective(src, out, m, new cv.Size(w, hh), flags, cv.BORDER_CONSTANT, border);
    return out;
  };
  try {
    if (lock === 'closeup' || lock === 'milsnabb') {
      const work = closeupWorkImage({ data: gray, width, height });
      let toMm: readonly number[];
      let note: string;
      if (lock === 'closeup') {
        const closeup = lockCloseupWork(work);
        if (!passesCloseupGate(closeup)) return 'close-up lock failed its gate; skipped';
        toMm = closeup.toMm;
        note = 'close-up lock, 4 px/mm';
      } else {
        // both faces are 500 mm across, so the precision canvas size fits
        const milsnabb = lockMilsnabbWork(work);
        if (!passesMilsnabbGate(milsnabb)) return 'milsnabb lock failed its gate; skipped';
        toMm = milsnabb.toMm;
        note = 'milsnabb lock, 4 px/mm';
      }
      const k = CANVAS_PX_PER_MM;
      const half = CANVAS_PX / 2;
      const h = mul3([k, 0, half, 0, k, half, 0, 0, 1], toMm);
      const big = keep(warp(rgb, h, CANVAS_PX, CANVAS_PX, cv.INTER_CUBIC, white));
      // outside the photo is white paper to the detector; crop to what was photographed
      const ones = keep(new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(255)));
      const seen = keep(warp(ones, h, CANVAS_PX, CANVAS_PX, cv.INTER_NEAREST, new cv.Scalar(0)));
      const r = cv.boundingRect(seen);
      // copyTo owns its rows; OpenCV.js's roi().clone() keeps the source stride
      const view = keep(big.roi(r));
      const cropped = new cv.Mat();
      view.copyTo(cropped);
      return {
        rgb: cropped,
        x0: r.x,
        y0: r.y,
        imageToLabel: h,
        centerXPx: half,
        centerYPx: half,
        pxPerMm: k,
        note,
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
      // whatever the lock found; the gate verdict says whether the app would
      // have accepted this canvas
      const { valid, reasons } = checkGeometryValidity(result.metrics);
      return {
        rgb: warp(rgb, h, SPIKE_CANVAS_PX, SPIKE_CANVAS_PX, cv.INTER_CUBIC, white),
        x0: 0,
        y0: 0,
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

/**
 * A photo at `longSide` px at most as an RGB Mat and its grey bytes; the
 * caller deletes the Mat. Downscaled by area averaging, as the spike loaded
 * the photos the hole filter was fitted on: a sharper filter finds other
 * candidates.
 */
export function loadPhoto(cv: Cv, path: string, longSide: number) {
  const photo = decode(path);
  let rgb = cv.matFromArray(photo.height, photo.width, cv.CV_8UC3, photo.rgb);
  const s = longSide / Math.max(photo.width, photo.height);
  if (s < 1) {
    const small = new cv.Mat();
    const size = new cv.Size(pyRoundInt(photo.width * s), pyRoundInt(photo.height * s));
    cv.resize(rgb, small, size, 0, 0, cv.INTER_AREA);
    rgb.delete();
    rgb = small;
  }
  const grayMat = new cv.Mat();
  try {
    cv.cvtColor(rgb, grayMat, cv.COLOR_RGB2GRAY);
    return {
      rgb,
      gray: (grayMat.data as Uint8Array).slice(),
      width: rgb.cols as number,
      height: rgb.rows as number,
    };
  } finally {
    grayMat.delete();
  }
}
