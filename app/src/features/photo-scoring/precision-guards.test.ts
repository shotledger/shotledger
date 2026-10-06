import { SPSF_PISTOL_25M_PRECISION } from '@shotledger/shared';

import fixture from './closeup-lock.fixtures.json';
import { closeupWorkImage, type XRingReading, xRingReading } from './closeup-lock';
import { holeCandidates, type ProposalFace } from './hole-proposals';
import { MILSNABB_GATE, type MilsnabbLock } from './milsnabb-lock';
import {
  faceDecision,
  HOLE_SIZE_GUARD,
  holeDiametersMm,
  holeSizeCheck,
  holesTooSmall,
  milsnabbLockRefuses,
  PERSPECTIVE_GUARD,
  perspectiveRefuses,
  proposalFaceOf,
  X_LINE_PROMPT,
  xLineMissing,
} from './precision-guards';
import type { Homography } from './corners';
import { syntheticCanvas, syntheticCloseup } from './synthetic-canvas';
import type { RectifiedCanvas } from './tap-snap';

const CALIBER = 5.6;

describe('holesTooSmall', () => {
  it('abstains without holes', () => {
    expect(holesTooSmall([], [], CALIBER)).toBe(false);
  });

  it('refuses holes found only at half the calibre that read about half of it', () => {
    expect(holesTooSmall([], [2.4, 2.6, 2.5], CALIBER)).toBe(true);
  });

  it('abstains when any hole reads at the calibre', () => {
    expect(holesTooSmall([4.6], [2.4, 2.6, 2.5], CALIBER)).toBe(false);
  });

  it('keeps holes that read about the calibre at half of it', () => {
    expect(holesTooSmall([], [4.1, 4.6, 6.86], CALIBER)).toBe(false);
  });

  it('decides on the median, so one torn or merged hole does not', () => {
    expect(holesTooSmall([], [2.5, 2.6, 6.86], CALIBER)).toBe(true);
    expect(holesTooSmall([], [1.2, 4.5, 4.8], CALIBER)).toBe(false);
  });

  it('puts the boundary at the declared share of the calibre', () => {
    const edge = HOLE_SIZE_GUARD.maxShare * CALIBER;
    expect(holesTooSmall([], [edge], CALIBER)).toBe(false);
    expect(holesTooSmall([], [edge - 0.01], CALIBER)).toBe(true);
  });
});

function milsnabbLock(overrides: Partial<MilsnabbLock>): MilsnabbLock {
  return {
    toMm: [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as MilsnabbLock['toMm'],
    center: { x: 0, y: 0 },
    residualMm: 0.2,
    comb: 20,
    ringOffsetMm: 0.3,
    ringLines: 4,
    rings: 4,
    support: 1,
    inFrame: true,
    voteCenter: { x: 0, y: 0 },
    period: 100,
    ...overrides,
  };
}

describe('milsnabbLockRefuses', () => {
  it('refuses when the milsnabb lock passes its gate', () => {
    expect(milsnabbLockRefuses(milsnabbLock({}))).toBe(true);
  });

  it('does not refuse when the milsnabb lock fails or finds nothing', () => {
    expect(milsnabbLockRefuses(null)).toBe(false);
    expect(milsnabbLockRefuses(milsnabbLock({ ringLines: MILSNABB_GATE.minLines - 1 }))).toBe(
      false,
    );
    expect(milsnabbLockRefuses(milsnabbLock({ ringOffsetMm: 3 }))).toBe(false);
  });
});

describe('holeDiametersMm on a synthetic canvas', () => {
  // The hole-proposal fixture's drawing, whose holes read about the calibre
  // at this scale. Read at twice it, the same pixels are a lock twice too large.
  const TRUE_PX_PER_MM = 5.5;
  const SIZE = 520;
  const HOLES = [
    [230, 250],
    [300, 300],
    [250, 320],
    [400, 260],
  ] as const;
  const data = syntheticCanvas({
    seed: 1,
    size: SIZE,
    holes: HOLES,
    patches: [],
    blackR: 160,
    rings: [40, 80, 120, 160, 200, 240],
    pad: 360,
  });
  const canvasAt = (pxPerMm: number): RectifiedCanvas => ({
    data,
    size: SIZE,
    centerXPx: SIZE / 2,
    centerYPx: SIZE / 2,
    pxPerMm,
  });
  const faceAt = (pxPerMm: number): ProposalFace => ({
    caliberMm: CALIBER,
    blackRadiusMm: 160 / pxPerMm,
    maxRadiusMm: 240 / pxPerMm,
    ringRadiiMm: [40, 80, 120, 160, 200, 240].map((r) => r / pxPerMm),
  });

  const reading = (pxPerMm: number) => {
    const at = (caliberMm: number) =>
      holeDiametersMm(canvasAt(pxPerMm), { ...faceAt(pxPerMm), caliberMm }, (c, f) =>
        holeCandidates(c, f),
      );
    return { full: at(CALIBER), half: at(CALIBER / 2) };
  };

  it('reads the holes at about the calibre through a true lock, and keeps it', () => {
    const { full, half } = reading(TRUE_PX_PER_MM);
    expect(full).toHaveLength(HOLES.length);
    for (const d of full) expect(d).toBeGreaterThan(0.8 * CALIBER);
    expect(holesTooSmall(full, half, CALIBER)).toBe(false);
  });

  it('finds them only at half the calibre through a lock twice too large, and refuses', () => {
    const { full, half } = reading(2 * TRUE_PX_PER_MM);
    expect(full).toEqual([]);
    expect(half.length).toBeGreaterThanOrEqual(HOLES.length - 1);
    expect(holesTooSmall(full, half, CALIBER)).toBe(true);
  });
});

describe('proposalFaceOf', () => {
  it('carries the calibre and the face radii in mm', () => {
    const face = proposalFaceOf(SPSF_PISTOL_25M_PRECISION, 9);
    expect(face.caliberMm).toBe(9);
    expect(face.blackRadiusMm).toBe(SPSF_PISTOL_25M_PRECISION.referenceDiameterMm / 2);
    expect(face.maxRadiusMm).toBe(
      Math.max(...SPSF_PISTOL_25M_PRECISION.rings.map((r) => r.diameterMm / 2)),
    );
    expect(face.ringRadiiMm).toHaveLength(SPSF_PISTOL_25M_PRECISION.rings.length);
  });
});

describe('perspectiveRefuses', () => {
  const size = { width: 2000, height: 1500 };
  const center = { x: 1000, y: 750 };
  // 0.1 mm per px round the centre, with the denominator tilted along x by g.
  const tilted = (g: number): Homography => [0.1, 0, -100, 0, 0.1, -75, g, 0, 1 - g * 1000];

  it('keeps a lock seen square on', () => {
    expect(perspectiveRefuses(tilted(0), center, size)).toBe(false);
  });

  it('keeps a tilt whose denominator stays inside the range at every corner', () => {
    // 1 -/+ 1000 g at the left and right edges.
    expect(perspectiveRefuses(tilted(0.0004), center, size)).toBe(false);
    expect(perspectiveRefuses(tilted(-0.0004), center, size)).toBe(false);
  });

  it('refuses where a corner falls outside the range', () => {
    const edge = 1 - PERSPECTIVE_GUARD.min;
    expect(perspectiveRefuses(tilted((edge + 0.01) / 1000), center, size)).toBe(true);
    expect(perspectiveRefuses(tilted(-(edge + 0.01) / 1000), center, size)).toBe(true);
  });

  it('refuses a mapping whose horizon crosses the photo', () => {
    expect(perspectiveRefuses(tilted(0.0015), center, size)).toBe(true);
  });

  it('reads the same at any scale of the matrix', () => {
    const h = tilted(0.0004).map((v) => -3 * v) as unknown as Homography;
    expect(perspectiveRefuses(h, center, size)).toBe(false);
  });
});

describe('xLineMissing', () => {
  const reading = (x: number, ten = 1, gap = 0.1): XRingReading => ({ x, ten, gap });

  it('abstains when the X ring could not be read', () => {
    expect(xLineMissing(null)).toBe(false);
  });

  it('keeps an X line about as strong as the 10', () => {
    expect(xLineMissing(reading(0.95))).toBe(false);
  });

  it('calls it missing when the X reads below both shares', () => {
    expect(xLineMissing(reading(0.01))).toBe(true);
  });

  it('needs both shares: weak against the 10 but well above the gaps is a line', () => {
    expect(xLineMissing(reading(0.1, 1, 0.01))).toBe(false);
  });

  it('puts the boundaries at the declared shares', () => {
    const ten = 1;
    const gap = 1;
    const edge = X_LINE_PROMPT.maxOfTen * ten;
    expect(xLineMissing(reading(edge, ten, gap))).toBe(false);
    expect(xLineMissing(reading(edge - 1e-6, ten, gap))).toBe(true);
    const gapEdge = X_LINE_PROMPT.maxOfGaps * 0.05;
    expect(xLineMissing(reading(gapEdge, ten, 0.05))).toBe(false);
    expect(xLineMissing(reading(gapEdge - 1e-6, ten, 0.05))).toBe(true);
  });
});

describe('faceDecision', () => {
  it('goes on as precision when the X line is there, whatever was answered', () => {
    expect(faceDecision(false, undefined)).toBe('precision');
    expect(faceDecision(false, 'milsnabb')).toBe('precision');
  });

  it('asks when the X line is missing and the session has no answer', () => {
    expect(faceDecision(true, undefined)).toBe('ask');
  });

  it('uses the session’s answer instead of asking again', () => {
    expect(faceDecision(true, 'precision')).toBe('precision');
    expect(faceDecision(true, 'milsnabb')).toBe('milsnabb');
  });
});

describe('xRingReading on line images', () => {
  // A line response 4 px per mm, 1 on each drawn circle, a floor of paper
  // texture elsewhere.
  const PX_PER_MM = 4;
  const SIZE = 480;
  const C = SIZE / 2;
  function workWith(radiiMm: readonly number[], covered?: (angle: number, rMm: number) => boolean) {
    const data = new Float64Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const r = Math.hypot(x - C, y - C) / PX_PER_MM;
        data[y * SIZE + x] = 0.05;
        if (covered?.(Math.atan2(y - C, x - C), r)) continue;
        if (radiiMm.some((R) => Math.abs(r - R) < 0.4)) data[y * SIZE + x] = 1;
      }
    }
    const image = { data, width: SIZE, height: SIZE };
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as Homography;
    return { g: image, lines: image, toWork: identity };
  }
  const s = 1 / PX_PER_MM;
  const toMm = [s, 0, -C * s, 0, s, -C * s, 0, 0, 1] as unknown as Homography;

  it('reads the X line on a precision centre', () => {
    const r = xRingReading(workWith([12.5, 25, 50]), toMm);
    expect(r).not.toBeNull();
    expect(r!.x / r!.ten).toBeGreaterThan(0.9);
    expect(xLineMissing(r)).toBe(false);
  });

  it('finds none where a milsnabb X and 10 sit on precision’s 10 and 9', () => {
    const r = xRingReading(workWith([25, 50]), toMm);
    expect(xLineMissing(r)).toBe(true);
  });

  it('cannot see an X line covered on most of the circle, as by pasters', () => {
    // Pasters over three quarters of a shot-out centre, inside the 10: the
    // median reads no line.
    const covered = (a: number, rMm: number) => rMm < 20 && a > -Math.PI / 2;
    const r = xRingReading(workWith([12.5, 25, 50], covered), toMm);
    expect(xLineMissing(r)).toBe(true);
  });

  it('abstains when the centre is out of frame', () => {
    const away = [s, 0, (-C - 200 * PX_PER_MM) * s, 0, s, -C * s, 0, 0, 1] as unknown as Homography;
    expect(xRingReading(workWith([12.5, 25, 50]), away)).toBeNull();
  });

  it('reads the X line on a drawn precision close-up through its true lock', () => {
    const scene = fixture.scenarios.find((sc) => sc.name === 'centred')!;
    const image = {
      width: scene.width,
      height: scene.height,
      data: syntheticCloseup({
        seed: scene.seed,
        width: scene.width,
        height: scene.height,
        H: scene.H,
        holes: scene.holes.map(([x, y]) => [x as number, y as number] as const),
      }),
    };
    const work = closeupWorkImage(image, undefined, fixture.workLongSide);
    const trueLock = scene.lock!.toMm as unknown as Homography;
    expect(xLineMissing(xRingReading(work, trueLock))).toBe(false);
    // The same photo through a lock twice too large puts precision's X and 10
    // on its 10 and 9, as a milsnabb crop's X and 10 do: no line at 12.5 mm.
    const twice = trueLock.map((v, i) => (i < 6 ? 2 * v : v)) as unknown as Homography;
    expect(xLineMissing(xRingReading(work, twice))).toBe(true);
  });
});

describe('holeSizeCheck on a synthetic canvas', () => {
  const pxPerMm = 5.5;
  const size = 520;
  const canvasAt = (scale: number): RectifiedCanvas => ({
    data: syntheticCanvas({
      seed: 1,
      size,
      holes: [
        [230, 250],
        [300, 300],
        [250, 320],
        [400, 260],
      ],
      patches: [],
      blackR: 160,
      rings: [40, 80, 120, 160, 200, 240],
      pad: 360,
    }),
    size,
    centerXPx: size / 2,
    centerYPx: size / 2,
    pxPerMm: scale * pxPerMm,
  });
  // Precision's face at the drawing's scale: the reading depends on the
  // canvas and calibre, not on which rings the face lists.
  const face = SPSF_PISTOL_25M_PRECISION;
  const counting = () => {
    const calls: number[] = [];
    const candidatesOf = (canvas: RectifiedCanvas, f: ProposalFace) => {
      calls.push(f.caliberMm);
      return holeCandidates(canvas, f);
    };
    return { calls, candidatesOf };
  };
  const eager = (canvas: RectifiedCanvas) => {
    const at = (caliberMm: number) =>
      holeDiametersMm(canvas, proposalFaceOf(face, caliberMm), (c, f) => holeCandidates(c, f));
    return holesTooSmall(at(CALIBER), at(CALIBER / 2), CALIBER);
  };

  it('skips the half-calibre run when the calibre reads a hole, with the same verdict', () => {
    const canvas = canvasAt(1);
    const { calls, candidatesOf } = counting();
    const check = holeSizeCheck(canvas, face, CALIBER, candidatesOf);
    expect(calls).toEqual([CALIBER]);
    expect(check.tooSmall).toBe(eager(canvas));
    expect(check.candidates).toEqual(holeCandidates(canvas, proposalFaceOf(face, CALIBER)));
  });

  it('runs at half the calibre when the calibre reads none, with the same verdict', () => {
    const canvas = canvasAt(2);
    const { calls, candidatesOf } = counting();
    const check = holeSizeCheck(canvas, face, CALIBER, candidatesOf);
    expect(calls).toEqual([CALIBER, CALIBER / 2]);
    expect(check.tooSmall).toBe(eager(canvas));
  });
});
