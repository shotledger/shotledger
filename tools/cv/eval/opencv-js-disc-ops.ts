// `DiscOps` on OpenCV.js (@techstark/opencv-js, a dev dependency pinned to the
// device's OpenCV 4.12.0), so Node runs the app's disc lock on the same
// library the phone does. Each method makes the call opencv.ts's
// `nativeDiscOps` makes, with react-native-fast-opencv's default arguments
// spelled out.
import { createRequire } from 'node:module';

import type { DiscOps, RotatedRectFit } from '../../../app/src/features/photo-scoring/disc-lock';

/* eslint-disable @typescript-eslint/no-explicit-any -- the WASM module's
   typings describe a cv namespace, not the loaded module object */
export type Cv = any;
type CvMat = any;
type CvMatVector = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

let loading: Promise<Cv> | null = null;

/** The OpenCV.js module, once its WASM runtime is up (~1.5 s). */
export function loadOpenCv(): Promise<Cv> {
  loading ??= new Promise((resolve) => {
    const mod = createRequire(import.meta.url)('@techstark/opencv-js');
    // The module is an Emscripten thenable whose `then` hands back the module
    // itself; awaiting it as-is would never settle.
    mod.then((cv: Cv) => {
      delete cv.then;
      resolve(cv);
    });
  });
  return loading;
}

/** `DiscOps` whose allocations are freed by `release()`. */
export interface OpenCvJsDiscOps extends DiscOps<CvMat, CvMatVector> {
  /** An 8-bit grey Mat holding a copy of `data`. */
  readonly gray: (data: Uint8Array, width: number, height: number) => CvMat;
  readonly release: () => void;
}

export function openCvJsDiscOps(cv: Cv): OpenCvJsDiscOps {
  const items: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(item: T): T => {
    items.push(item);
    return item;
  };
  const dst = () => keep(new cv.Mat());
  const rectFit = (r: {
    center: { x: number; y: number };
    size: { width: number; height: number };
    angle: number;
  }): RotatedRectFit => ({
    x: r.center.x,
    y: r.center.y,
    width: r.size.width,
    height: r.size.height,
    angle: r.angle,
  });
  const white = () => new cv.Scalar(255, 255, 255, 0);

  return {
    gray: (data, width, height) => keep(cv.matFromArray(height, width, cv.CV_8UC1, data)),
    size: (img) => ({ rows: img.rows, cols: img.cols }),
    zeros: (rows, cols) => keep(cv.Mat.zeros(rows, cols, cv.CV_8UC1)),
    gaussianBlur: (src, ksize) => {
      const out = dst();
      cv.GaussianBlur(src, out, new cv.Size(ksize, ksize), 0, 0, cv.BORDER_DEFAULT);
      return out;
    },
    thresholdOtsuInv: (src) => {
      const out = dst();
      cv.threshold(src, out, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
      return out;
    },
    rectKernel: (ksize) =>
      keep(
        cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ksize, ksize), new cv.Point(-1, -1)),
      ),
    morphologyEx: (img, op, kernel) =>
      cv.morphologyEx(
        img,
        img,
        op === 'open' ? cv.MORPH_OPEN : cv.MORPH_CLOSE,
        kernel,
        new cv.Point(-1, -1),
        1,
        cv.BORDER_CONSTANT,
        cv.morphologyDefaultBorderValue(),
      ),
    externalContours: (binary) => {
      const contours = keep(new cv.MatVector());
      const hierarchy = dst();
      cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
      return contours;
    },
    contourCount: (contours) => contours.size(),
    contourArea: (contours, index) => {
      const c = keep(contours.get(index));
      return cv.contourArea(c, false);
    },
    fitContourEllipse: (contours, index) => rectFit(cv.fitEllipse(keep(contours.get(index)))),
    fillContour: (mask, contours, index) =>
      cv.drawContours(mask, contours, index, white(), -1, cv.LINE_8),
    fitPointsEllipse: (xy) =>
      rectFit(cv.fitEllipse(keep(cv.matFromArray(xy.length / 2, 1, cv.CV_32SC2, [...xy])))),
    warpPerspective: (src, matrix, size) => {
      const out = dst();
      cv.warpPerspective(
        src,
        out,
        keep(cv.matFromArray(3, 3, cv.CV_64F, [...matrix])),
        new cv.Size(size, size),
        cv.INTER_CUBIC,
        cv.BORDER_CONSTANT,
        white(),
      );
      return out;
    },
    warpPolar: (src, cx, cy, maxRadius, cols, rows) => {
      const out = dst();
      // A plain {x, y}: the binding reads it as the Point2f the C++ takes,
      // where cv.Point would truncate the centre to integers.
      cv.warpPolar(src, out, new cv.Size(cols, rows), { x: cx, y: cy }, maxRadius, cv.INTER_LINEAR);
      return out;
    },
    circleMaskMean: (src, cx, cy, circles) => {
      const mask = keep(cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1));
      const center = new cv.Point(cx, cy);
      for (const { radius, value } of circles) {
        cv.circle(mask, center, radius, new cv.Scalar(value, value, value, 0), -1, cv.LINE_8);
      }
      return cv.mean(src, mask)[0];
    },
    // Copied: a view on the WASM heap goes stale when the heap grows, which
    // the next allocation can do.
    bytes: (img) => ({ data: (img.data as Uint8Array).slice(), rows: img.rows, cols: img.cols }),
    release: () => {
      for (const item of items.reverse()) item.delete();
      items.length = 0;
    },
  };
}
