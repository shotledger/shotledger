import { closeupWorkImage, type GrayImage } from './closeup-lock';
import { applyHomography, type Homography } from './corners';
import {
  lockMilsnabbWork,
  MILSNABB_GATE,
  milsnabbArcOffsetsMm,
  type MilsnabbLock,
  passesMilsnabbGate,
} from './milsnabb-lock';
import { CLOSEUP_DRAWING, hash32, syntheticCloseup } from './synthetic-canvas';
import { invertHomography } from './transform';

// Synthetic milsnabb photos: the face (SHB J.7.1) black out to 250 mm with
// 1 mm white ring lines whose outer edge is the ring's radius, and a centre
// card stapled on 1.5 mm off the face's centre, printed with the X, 10, 9
// and 8 lines. No real photo is involved (hard rule 7).
const FACE_RINGS = [170, 210];
const CARD_RINGS = [25, 50, 90, 130];
const CARD_HALF = 140;
const CARD_OFFSET = { x: 1.5, y: -1 };

/** Grey at a point of the face, mm from the face's centre. */
function shade(X: number, Y: number): number {
  const cx = X - CARD_OFFSET.x;
  const cy = Y - CARD_OFFSET.y;
  const onCard =
    Math.abs(cx) <= CARD_HALF && Math.abs(cy) <= CARD_HALF && Math.abs(cx) + Math.abs(cy) <= 240;
  const line = (r: number, rings: number[]) => rings.some((R) => r <= R && r >= R - 1);
  if (onCard) return line(Math.hypot(cx, cy), CARD_RINGS) ? 205 : 48;
  const r = Math.hypot(X, Y);
  if (r > 250) return 225;
  return line(r, FACE_RINGS) ? 200 : 36;
}

interface Scene {
  readonly width: number;
  readonly height: number;
  /** Image px -> mm of the face. */
  readonly toFaceMm: Homography;
}

/** Image px -> face mm: centre at (cx, cy) px, `ppmm` px per mm, a tilt. */
function scene(o: {
  width: number;
  height: number;
  cx: number;
  cy: number;
  ppmm: number;
  tilt: [number, number];
  rotate: number;
}): Scene {
  const c = Math.cos(o.rotate) / o.ppmm;
  const s = Math.sin(o.rotate) / o.ppmm;
  const [p, q] = o.tilt;
  return {
    width: o.width,
    height: o.height,
    toFaceMm: [
      c,
      -s,
      -(c * o.cx - s * o.cy),
      s,
      c,
      -(s * o.cx + c * o.cy),
      p,
      q,
      1 - p * o.cx - q * o.cy,
    ] as unknown as Homography,
  };
}

function draw(sc: Scene, seed: number): GrayImage {
  const { width, height, toFaceMm } = sc;
  const data = new Uint8Array(width * height);
  const sub = [0.25, 0.75];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      for (const dy of sub) {
        for (const dx of sub) {
          const m = applyHomography(toFaceMm, { x: x - 0.5 + dx, y: y - 0.5 + dy });
          total += shade(m.x, m.y);
        }
      }
      const v = Math.round(total / 4) + (hash32(x, y, seed) % 7) - 3;
      data[y * width + x] = Math.min(255, Math.max(0, v));
    }
  }
  return { width, height, data };
}

const W = 768;
const H = 1024;
const tilted = scene({
  width: W,
  height: H,
  cx: 390,
  cy: 520,
  ppmm: 2.6,
  tilt: [2e-4, -1.5e-4],
  rotate: 0.05,
});
const SCENES = {
  // the card and some of the face, tilted: the lock maps the card
  tilted,
  // the X, 10 and 9 only, off-centre
  close: scene({ width: W, height: H, cx: 400, cy: 490, ppmm: 5, tilt: [0, 1e-4], rotate: -0.1 }),
  // the 8 and 7 rings, centre out of frame
  outer: scene({ width: W, height: H, cx: -330, cy: 500, ppmm: 4, tilt: [0, 0], rotate: 0 }),
  // the X and 10 alone: two lines read 1:2 on both faces
  tight: scene({ width: W, height: H, cx: 384, cy: 512, ppmm: 13, tilt: [0, 0], rotate: 0 }),
};

const results = new Map<string, { lock: MilsnabbLock | null; image: GrayImage }>();
beforeAll(() => {
  for (const [name, sc] of Object.entries(SCENES)) {
    const image = draw(sc, 11);
    results.set(name, { lock: lockMilsnabbWork(closeupWorkImage(image)), image });
  }
  // the precision face, from the precision lock's synthetic close-up
  const pre = {
    width: 1024,
    height: 768,
    data: syntheticCloseup({
      seed: 3,
      width: 1024,
      height: 768,
      // quarter-pixel samples -> 1/8 mm: 3 px per mm, centred
      H: [2, 0, -2 * 4 * 512, 0, 2, -2 * 4 * 384, 0, 0, 3],
      holes: [],
    }),
  };
  results.set('precision', { lock: lockMilsnabbWork(closeupWorkImage(pre)), image: pre });
}, 180_000);

/** Image px -> card mm, the truth a lock is held to. */
function toCardMm(sc: Scene): Homography {
  const t = [1, 0, -CARD_OFFSET.x, 0, 1, -CARD_OFFSET.y, 0, 0, 1];
  const a = sc.toFaceMm as unknown as number[];
  const out: number[] = [];
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 3; c += 1)
      out.push(t[3 * r]! * a[c]! + t[3 * r + 1]! * a[3 + c]! + t[3 * r + 2]! * a[6 + c]!);
  return out as unknown as Homography;
}

/** Worst radius error (mm) of the lock on points of the card's rings that
 *  are in frame, and its centre's distance from the card's. */
function errors(lock: MilsnabbLock, sc: Scene) {
  const truth = toCardMm(sc);
  const back = invertHomography(truth)!;
  let worst = 0;
  for (const R of CARD_RINGS) {
    for (let i = 0; i < 72; i += 1) {
      const a = (i * Math.PI) / 36;
      const p = applyHomography(back, { x: R * Math.cos(a), y: R * Math.sin(a) });
      if (p.x < 0 || p.y < 0 || p.x > sc.width - 1 || p.y > sc.height - 1) continue;
      const q = applyHomography(lock.toMm, p);
      worst = Math.max(worst, Math.abs(Math.hypot(q.x, q.y) - R));
    }
  }
  const c = applyHomography(truth, lock.center);
  return { worst, centre: Math.hypot(c.x, c.y) };
}

it('locks a tilted photo of the centre card to the card, not the face', () => {
  const { lock } = results.get('tilted')!;
  expect(passesMilsnabbGate(lock)).toBe(true);
  const e = errors(lock!, SCENES.tilted);
  expect(e.centre).toBeLessThan(0.15);
  expect(e.worst).toBeLessThan(0.15);
  expect(lock!.ringLines).toBe(4);
});

it('locks a close-up of the X, 10 and 9 rings', () => {
  const { lock } = results.get('close')!;
  expect(passesMilsnabbGate(lock)).toBe(true);
  const e = errors(lock!, SCENES.close);
  expect(e.centre).toBeLessThan(0.15);
  expect(e.worst).toBeLessThan(0.15);
  expect(lock!.ringLines).toBeGreaterThanOrEqual(MILSNABB_GATE.minLines);
});

it('reads the face rings outside the card off by the card’s offset', () => {
  const { lock, image } = results.get('tilted')!;
  const work = closeupWorkImage(image);
  const face = milsnabbArcOffsetsMm(work, lock!.toMm, [170, 210]).flat();
  const read = face.filter((v): v is number => v !== null);
  expect(read.length).toBeGreaterThan(0);
  // the card sits 1.8 mm off the face, so some quarter of a face ring is off
  expect(Math.max(...read.map(Math.abs))).toBeGreaterThan(0.8);
});

it('refuses a photo whose centre is out of frame', () => {
  expect(passesMilsnabbGate(results.get('outer')!.lock)).toBe(false);
});

it('refuses a close-up of the X and 10 alone', () => {
  expect(passesMilsnabbGate(results.get('tight')!.lock)).toBe(false);
});

it('refuses the precision face', () => {
  expect(CLOSEUP_DRAWING.rings.length).toBeGreaterThan(3);
  expect(passesMilsnabbGate(results.get('precision')!.lock)).toBe(false);
});

it('gates on every part of the lock', () => {
  const lock = results.get('tilted')!.lock!;
  expect(passesMilsnabbGate(lock)).toBe(true);
  expect(passesMilsnabbGate(null)).toBe(false);
  for (const bad of [
    { residualMm: 0.6 },
    { comb: 7 },
    { ringOffsetMm: 0.6 },
    { ringOffsetMm: null },
    { ringLines: 2 },
    { inFrame: false },
  ]) {
    expect([bad, passesMilsnabbGate({ ...lock, ...bad })]).toEqual([bad, false]);
  }
});
