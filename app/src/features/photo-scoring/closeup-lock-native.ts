// The close-up lock's image-wide operations on react-native-fast-opencv.
//
// `closeup-lock.ts` is the reference and runs everywhere; this file only
// replaces its four image-wide operations with OpenCV's, in float64. The pure
// blurs over a 1536 px work image and the polar resamples are most of the
// lock's arithmetic, and under Hermes they would take tens of seconds. The
// polar grid is `warpPolar`'s (remap is missing upstream), whose fixed-point
// sampling moves a sample by at most 1/32 px against the reference.
import type { Mat } from 'react-native-fast-opencv';
import {
  BorderTypes,
  DataTypes,
  InterpolationFlags,
  Mat as MatClass,
  OpenCV,
  Point2f,
  Size,
} from 'react-native-fast-opencv';

import { type CloseupImage, type CloseupOps, type GrayImage, gaussianKsize } from './closeup-lock';

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

type Keep = <M extends { release(): void }>(m: M) => M;

function floatMat(keep: Keep, img: GrayImage): Mat {
  const { data, width, height } = img;
  if (data instanceof Float64Array) {
    return keep(MatClass.createFromBuffer('float64', height, width, 1, data));
  }
  const src = keep(
    data instanceof Uint8Array
      ? MatClass.createFromBuffer('uint8', height, width, 1, data)
      : MatClass.createFromBuffer('float32', height, width, 1, data),
  );
  const out = keep(MatClass.create(1, 1, DataTypes.CV_8U));
  OpenCV.convertTo(src, out, DataTypes.CV_64F);
  return out;
}

function copyOut(mat: Mat): Float64Array {
  // `.buffer` is a view on native memory the release frees, hence the copy.
  return Float64Array.from(mat.toBuffer('float64').buffer);
}

export const nativeCloseupOps: CloseupOps = {
  resizeArea: (img, width, height): CloseupImage =>
    withArena((keep) => {
      const dst = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      OpenCV.resize(
        floatMat(keep, img),
        dst,
        keep(Size.create(width, height)),
        0,
        0,
        InterpolationFlags.INTER_AREA,
      );
      return { data: copyOut(dst), width, height };
    }),
  blur: (img, sx, sy) =>
    withArena((keep) => {
      const dst = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      OpenCV.GaussianBlur(
        floatMat(keep, img),
        dst,
        keep(Size.create(gaussianKsize(sx), gaussianKsize(sy))),
        sx,
        sy,
        BorderTypes.BORDER_REFLECT_101,
      );
      return copyOut(dst);
    }),
  sobel: (img) =>
    withArena((keep) => {
      const src = floatMat(keep, img);
      const gx = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      const gy = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      OpenCV.Sobel(src, gx, DataTypes.CV_64F, 1, 0, 3, 1, 0, BorderTypes.BORDER_REFLECT_101);
      OpenCV.Sobel(src, gy, DataTypes.CV_64F, 0, 1, 3, 1, 0, BorderTypes.BORDER_REFLECT_101);
      return { gx: copyOut(gx), gy: copyOut(gy) };
    }),
  polar: (img, cx, cy, nang, rmax) =>
    withArena((keep) => {
      const dst = keep(MatClass.create(1, 1, DataTypes.CV_8U));
      // rmax columns over a radius of rmax: one column per px, as the reference
      OpenCV.warpPolar(
        floatMat(keep, img),
        dst,
        keep(Size.create(rmax, nang)),
        keep(Point2f.create(cx, cy)),
        rmax,
        InterpolationFlags.INTER_LINEAR | InterpolationFlags.WARP_FILL_OUTLIERS,
      );
      return copyOut(dst);
    }),
};
