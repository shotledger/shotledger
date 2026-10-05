// The milsnabb canvas of label-canvas.ts on a synthetic photo (hard rule 7: no
// real photo here): the lock's centre lands on the canvas centre, at 4 px/mm,
// and a photo with no rings is refused rather than labelled.
//
//   pnpm exec vitest run -c tools/cv/vitest.config.ts label-canvas.check
import { expect, test } from 'vitest';

import { loadOpenCv } from '../eval/opencv-js-disc-ops';
import { CANVAS_PX, faceFor, labelCanvas, parseLock } from './label-canvas';

// The scene of milsnabb-lock.test.ts, upright and untilted: black face out to
// 250 mm, a centre card on it printed with the 25, 50, 90 and 130 mm lines
// (outer edge on the radius, 1 mm wide).
const CARD_RINGS = [25, 50, 90, 130];
const CARD_HALF = 140;
const PPMM = 2.6;
const SIZE = 1300;
const CENTRE = SIZE / 2;

function shade(x: number, y: number): number {
  const X = (x - CENTRE) / PPMM;
  const Y = (y - CENTRE) / PPMM;
  const onCard =
    Math.abs(X) <= CARD_HALF && Math.abs(Y) <= CARD_HALF && Math.abs(X) + Math.abs(Y) <= 240;
  const r = Math.hypot(X, Y);
  if (onCard) return CARD_RINGS.some((R) => r <= R && r >= R - 1) ? 205 : 48;
  return r > 250 ? 225 : 36;
}

function scene(paint: (x: number, y: number) => number) {
  const rgb = new Uint8Array(SIZE * SIZE * 3);
  const gray = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const v = paint(x, y);
      gray[y * SIZE + x] = v;
      rgb.fill(v, (y * SIZE + x) * 3, (y * SIZE + x) * 3 + 3);
    }
  }
  return { rgb, gray };
}

test('the milsnabb lock puts the card centre at the canvas centre, 4 px/mm', async () => {
  const cv = await loadOpenCv();
  const { rgb, gray } = scene(shade);
  const mat = cv.matFromArray(SIZE, SIZE, cv.CV_8UC3, rgb);
  try {
    const out = labelCanvas(cv, mat, gray, 'milsnabb');
    expect(typeof out).not.toBe('string');
    if (typeof out === 'string') return;
    try {
      expect(out.pxPerMm).toBe(4);
      expect(out.centerXPx).toBe(CANVAS_PX / 2);
      expect(out.note).toContain('milsnabb');
      // the grid's PNG reads rows of width * 3 bytes, so the crop must own its rows
      expect(out.rgb.isContinuous()).toBe(true);
      // the photo's centre pixel is the target's centre: it maps to the canvas centre
      const [a, b, c, d, e, f, g, h, i] = out.imageToLabel as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const w = g * CENTRE + h * CENTRE + i;
      const lx = (a * CENTRE + b * CENTRE + c) / w;
      const ly = (d * CENTRE + e * CENTRE + f) / w;
      expect(Math.hypot(lx - out.centerXPx, ly - out.centerYPx)).toBeLessThan(2);
    } finally {
      out.rgb.delete();
    }
  } finally {
    mat.delete();
  }
});

test('a photo without rings gets no milsnabb canvas', async () => {
  const cv = await loadOpenCv();
  const { rgb, gray } = scene(() => 120);
  const mat = cv.matFromArray(SIZE, SIZE, cv.CV_8UC3, rgb);
  try {
    expect(labelCanvas(cv, mat, gray, 'milsnabb')).toBe('milsnabb lock failed its gate; skipped');
  } finally {
    mat.delete();
  }
});

test('lock names and the faces they label', () => {
  expect(parseLock('milsnabb', 'X')).toBe('milsnabb');
  expect(() => parseLock('corners', 'X')).toThrow('X=corners (one of disc, closeup, milsnabb)');
  expect(faceFor('milsnabb').blackRadiusMm).toBe(250);
  expect(faceFor('closeup').blackRadiusMm).toBe(100);
  expect(faceFor('milsnabb').ringRadiiMm.at(-1)).toBe(250);
});
