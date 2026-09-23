// The hole-proposal stage's whole-canvas maps on react-native-fast-opencv.
//
// `hole-proposals.ts` is the reference and runs everywhere; this file only
// replaces its three whole-canvas operations with OpenCV's, which compute the
// same thing in float64 — a Gaussian blur with the same kernel, the same
// 4-neighbour Laplacian, a box maximum — in well under a second where the
// pure loops take about two minutes under Hermes (measured on the emulator).
// Same integration facts as opencv.ts: pixels cross the bridge as whole
// buffers, so each operation copies its result out once.
import type { Mat } from 'react-native-fast-opencv';
import {
  BorderTypes,
  DataTypes,
  InterpolationFlags,
  Mat as MatClass,
  OpenCV,
  Point,
  Size,
} from 'react-native-fast-opencv';

import { gaussianKernel, type MapImage, type MapOps, pureMapOps } from './hole-proposals';

/** Every Mat created here is released in one place, as opencv.ts does. */
function withArena<T>(work: (keep: <M extends { release(): void }>(m: M) => M) => T): T {
  const items: { release(): void }[] = [];
  const keep = <M extends { release(): void }>(m: M): M => {
    items.push(m);
    return m;
  };
  try {
    return work(keep);
  } finally {
    for (const item of items.reverse()) {
      try {
        item.release();
      } catch {
        // A double release must not mask the operation's own error.
      }
    }
  }
}

function floatMat(keep: <M extends { release(): void }>(m: M) => M, img: MapImage): Mat {
  return keep(MatClass.createFromBuffer('float64', img.height, img.width, 1, img.data));
}

function copyOut(mat: Mat): Float64Array {
  // `.buffer` is the typed array itself, a view on native memory the release
  // below frees — hence the copy.
  return Float64Array.from(mat.toBuffer('float64').buffer);
}

export const nativeMapOps: MapOps = {
  halfResolution: (canvas) => {
    // INTER_AREA is the exact 2x2 mean only for an even side; an odd canvas
    // takes the reference path, which drops the last row and column.
    if (canvas.size % 2 !== 0) return pureMapOps.halfResolution(canvas);
    return withArena((keep) => {
      const src = keep(
        MatClass.createFromBuffer('uint8', canvas.size, canvas.size, 1, canvas.data),
      );
      const asFloat = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      OpenCV.convertTo(src, asFloat, DataTypes.CV_64F);
      const half = canvas.size / 2;
      const dst = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      OpenCV.resize(
        asFloat,
        dst,
        keep(Size.create(half, half)),
        0,
        0,
        InterpolationFlags.INTER_AREA,
      );
      return { data: copyOut(dst), width: half, height: half };
    });
  },
  blurLaplacian: (img, sigma) =>
    withArena((keep) => {
      const src = floatMat(keep, img);
      const ksize = gaussianKernel(sigma).length;
      const blurred = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      OpenCV.GaussianBlur(
        src,
        blurred,
        keep(Size.create(ksize, ksize)),
        sigma,
        sigma,
        BorderTypes.BORDER_REFLECT_101,
      );
      const lap = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      OpenCV.Laplacian(blurred, lap, DataTypes.CV_64F, 1, 1, 0, BorderTypes.BORDER_REFLECT_101);
      return copyOut(lap);
    }),
  maxFilter: (data, width, height, radius) =>
    withArena((keep) => {
      const src = floatMat(keep, { data, width, height });
      const side = 2 * radius + 1;
      const kernel = keep(
        MatClass.createFromBuffer('uint8', side, side, 1, new Uint8Array(side * side).fill(1)),
      );
      const dst = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      OpenCV.dilate(
        src,
        dst,
        kernel,
        keep(Point.create(-1, -1)),
        1,
        BorderTypes.BORDER_CONSTANT,
        OpenCV.morphologyDefaultBorderValue(),
      );
      return copyOut(dst);
    }),
};
