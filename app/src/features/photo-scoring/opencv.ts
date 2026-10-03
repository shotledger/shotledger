// The disc lock (disc-lock.ts) and the close-up lock on react-native-fast-opencv.
//
// `nativeDiscOps` is `DiscOps` on the device's OpenCV, one native call per
// operation, every allocation through an `Arena`; the algorithm itself is in
// disc-lock.ts, which an evaluation in Node runs on OpenCV.js instead.
import type { Mat, MatVector as MatVectorType, RotatedRect } from 'react-native-fast-opencv';
import {
  BorderTypes,
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  InterpolationFlags,
  LineTypes,
  MatVector,
  Mat as MatClass,
  MorphShapes,
  MorphTypes,
  OpenCV,
  Point,
  Point2f,
  PointVector,
  RetrievalModes,
  Scalar,
  Size,
  ThresholdTypes,
} from 'react-native-fast-opencv';

import { type CloseupLock, closeupWorkImage, lockCloseupWork, ringOffsetMm } from './closeup-lock';
import { nativeCloseupOps } from './closeup-lock-native';
import { lockMilsnabbWork, type MilsnabbLock } from './milsnabb-lock';
import type { Homography } from './corners';
import {
  type DiscLockOptions,
  type DiscOps,
  type GeometryPipelineResult,
  type RotatedRectFit,
  rectifyWithHomography,
  runDiscLock,
} from './disc-lock';
import type { RectifiedCanvas } from './tap-snap';

export { CANVAS_PX_PER_MM, type GeometryPipelineResult } from './disc-lock';

/**
 * Native objects live in a native buffer until released, and a photo-heavy
 * session that leaks them runs out of memory. Everything allocated goes
 * through this so one `releaseAll` in a `finally` covers the whole pipeline.
 */
class Arena {
  private readonly items: { release(): void }[] = [];

  keep<T extends { release(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  /** An output Mat: OpenCV resizes `dst` itself, so the initial shape is a
   *  placeholder. */
  dst(): Mat {
    return this.keep(MatClass.create(1, 1, DataTypes.CV_8U));
  }

  /** A zero-filled single-channel mask. Built from a typed array rather than
   *  a JS number[] — a 2048px mask is 4M entries. */
  mask(rows: number, cols: number): Mat {
    return this.keep(
      MatClass.createFromBuffer('uint8', rows, cols, 1, new Uint8Array(rows * cols)),
    );
  }

  releaseAll(): void {
    for (const item of this.items.reverse()) {
      try {
        item.release();
      } catch {
        // A double release must not mask the pipeline's own error.
      }
    }
    this.items.length = 0;
  }
}

function rectFit(rect: RotatedRect): RotatedRectFit {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, angle: rect.angle };
}

/** `DiscOps` on react-native-fast-opencv; everything it allocates is `arena`'s. */
function nativeDiscOps(arena: Arena): DiscOps<Mat, MatVectorType> {
  return {
    size: (img) => ({ rows: img.rows, cols: img.cols }),
    zeros: (rows, cols) => arena.mask(rows, cols),
    gaussianBlur: (src, ksize) => {
      const dst = arena.dst();
      OpenCV.GaussianBlur(src, dst, arena.keep(Size.create(ksize, ksize)), 0);
      return dst;
    },
    thresholdOtsuInv: (src) => {
      const dst = arena.dst();
      OpenCV.threshold(
        src,
        dst,
        0,
        255,
        ThresholdTypes.THRESH_BINARY_INV | ThresholdTypes.THRESH_OTSU,
      );
      return dst;
    },
    rectKernel: (ksize) =>
      arena.keep(
        OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, arena.keep(Size.create(ksize, ksize))),
      ),
    morphologyEx: (img, op, kernel) =>
      OpenCV.morphologyEx(
        img,
        img,
        op === 'open' ? MorphTypes.MORPH_OPEN : MorphTypes.MORPH_CLOSE,
        kernel,
      ),
    externalContours: (binary) => {
      const contours = arena.keep(MatVector.create());
      OpenCV.findContours(
        binary,
        contours,
        RetrievalModes.RETR_EXTERNAL,
        ContourApproximationModes.CHAIN_APPROX_NONE,
      );
      return contours;
    },
    contourCount: (contours) => contours.length,
    contourArea: (contours, index) => OpenCV.contourArea(contours.get(index)).value,
    fitContourEllipse: (contours, index) =>
      rectFit(arena.keep(OpenCV.fitEllipse(contours.get(index)))),
    fillContour: (mask, contours, index) =>
      OpenCV.drawContours(
        mask,
        contours,
        index,
        arena.keep(Scalar.create(255, 255, 255)),
        -1,
        LineTypes.LINE_8,
      ),
    fitPointsEllipse: (xy) => {
      const points = arena.keep(PointVector.create());
      for (let i = 0; i < xy.length; i += 2) {
        points.push(arena.keep(Point.create(xy[i] as number, xy[i + 1] as number)));
      }
      return rectFit(arena.keep(OpenCV.fitEllipse(points)));
    },
    warpPerspective: (src, matrix, size) => {
      const dst = arena.dst();
      OpenCV.warpPerspective(
        src,
        dst,
        arena.keep(MatClass.create(3, 3, DataTypes.CV_64F, [...matrix])),
        arena.keep(Size.create(size, size)),
        InterpolationFlags.INTER_CUBIC,
        BorderTypes.BORDER_CONSTANT,
        arena.keep(Scalar.create(255, 255, 255)),
      );
      return dst;
    },
    warpPolar: (src, cx, cy, maxRadius, cols, rows) => {
      const dst = arena.dst();
      OpenCV.warpPolar(
        src,
        dst,
        arena.keep(Size.create(cols, rows)),
        arena.keep(Point2f.create(cx, cy)),
        maxRadius,
        InterpolationFlags.INTER_LINEAR,
      );
      return dst;
    },
    circleMaskMean: (src, cx, cy, circles) => {
      const mask = arena.mask(src.rows, src.cols);
      const center = arena.keep(Point.create(cx, cy));
      for (const { radius, value } of circles) {
        OpenCV.circle(
          mask,
          center,
          radius,
          arena.keep(Scalar.create(value, value, value)),
          -1,
          LineTypes.LINE_8,
        );
      }
      return OpenCV.mean(src, mask).a;
    },
    // `.buffer` is the typed array itself, not an ArrayBuffer, despite the
    // name; a view on native memory that releaseAll frees.
    bytes: (img) => {
      const { buffer, rows, cols } = img.toBuffer('uint8');
      return { data: buffer, rows, cols };
    },
  };
}

/** The photo, decoded, as the grey Mat the locks work on. */
function grayFromBase64(arena: Arena, base64: string): Mat {
  const src = arena.keep(MatClass.createFromBase64(base64));
  const gray = arena.dst();
  OpenCV.cvtColor(src, gray, ColorConversionCodes.COLOR_BGR2GRAY);
  return gray;
}

export interface RunGeometryOptions extends DiscLockOptions {
  readonly base64: string;
}

/** The disc lock (`runDiscLock`) on a photo. */
export function runGeometry(options: RunGeometryOptions): GeometryPipelineResult {
  const arena = new Arena();
  try {
    return runDiscLock(nativeDiscOps(arena), grayFromBase64(arena, options.base64), options);
  } finally {
    arena.releaseAll();
  }
}

/** `rectifyWithHomography` on a photo. */
export function rectifyFromHomography(options: {
  readonly base64: string;
  /** Image px -> target mm. */
  readonly toMm: Homography;
  /** Radius of the outermost scoring ring, mm. */
  readonly outerRadiusMm: number;
}): RectifiedCanvas {
  const arena = new Arena();
  try {
    return rectifyWithHomography(
      nativeDiscOps(arena),
      grayFromBase64(arena, options.base64),
      options,
    );
  } finally {
    arena.releaseAll();
  }
}

export interface CloseupLockRun {
  readonly lock: CloseupLock | null;
  /** `discToMm`'s ring offset, measured on the same work image as the lock's. */
  readonly discRingOffsetMm: number | null;
}

/**
 * The close-up lock (closeup-lock.ts) on the geometry image, with OpenCV doing
 * its image-wide operations. Given the disc lock's image px -> mm mapping,
 * also holds that to the same ring-offset yardstick, so the two can be
 * compared.
 */
export function runCloseupLock(options: {
  readonly base64: string;
  readonly discToMm?: Homography;
}): CloseupLockRun {
  const work = closeupWorkImage(grayOf(options.base64), nativeCloseupOps);
  return {
    lock: lockCloseupWork(work, nativeCloseupOps),
    discRingOffsetMm: options.discToMm ? ringOffsetMm(work, options.discToMm) : null,
  };
}

/** The milsnabb lock (milsnabb-lock.ts) on the geometry image, with OpenCV
 *  doing the image-wide operations as for the close-up lock. */
export function runMilsnabbLock(options: { readonly base64: string }): MilsnabbLock | null {
  return lockMilsnabbWork(
    closeupWorkImage(grayOf(options.base64), nativeCloseupOps),
    nativeCloseupOps,
  );
}

function grayOf(base64: string): { data: Uint8Array; width: number; height: number } {
  const arena = new Arena();
  try {
    const src = arena.keep(MatClass.createFromBase64(base64));
    const mat = arena.dst();
    OpenCV.cvtColor(src, mat, ColorConversionCodes.COLOR_BGR2GRAY);
    const { buffer, rows, cols } = mat.toBuffer('uint8');
    // Copied: the view points at native memory that releaseAll frees.
    return { data: Uint8Array.from(buffer), width: cols, height: rows };
  } finally {
    arena.releaseAll();
  }
}
