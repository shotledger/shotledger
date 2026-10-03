import { SPSF_PISTOL_25M_PRECISION } from '@shotledger/shared';

import { holeCandidates, type ProposalFace } from './hole-proposals';
import { MILSNABB_GATE, type MilsnabbLock } from './milsnabb-lock';
import {
  HOLE_SIZE_GUARD,
  holeDiametersMm,
  holesTooSmall,
  milsnabbLockRefuses,
  proposalFaceOf,
} from './precision-guards';
import { syntheticCanvas } from './synthetic-canvas';
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
