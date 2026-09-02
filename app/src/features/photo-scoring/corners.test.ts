import { SPSF_PISTOL_25M_PRECISION as TARGET } from '@shotledger/shared';

import {
  applyHomography,
  homographyFromQuad,
  outerRingReferencePoints,
  transformFromCorners,
} from './corners';

const p = (x: number, y: number) => ({ x, y });

describe('outerRingReferencePoints', () => {
  it('is the outermost ring extremes, top/right/bottom/left', () => {
    // precision face: ring 1 is 500mm across, so r = 250mm
    expect(outerRingReferencePoints(TARGET)).toEqual([
      p(0, -250),
      p(250, 0),
      p(0, 250),
      p(-250, 0),
    ]);
  });

  it('throws for a target with no rings', () => {
    expect(() => outerRingReferencePoints({ rings: [] })).toThrow(RangeError);
  });
});

describe('homographyFromQuad', () => {
  it('recovers a pure translation', () => {
    const from = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];
    const to = from.map((q) => p(q.x + 5, q.y - 3));
    const h = homographyFromQuad(from, to);
    expect(h).not.toBeNull();
    for (const q of [p(0, 0), p(4, 7), p(10, 10)]) {
      const mapped = applyHomography(h!, q);
      expect(mapped.x).toBeCloseTo(q.x + 5, 9);
      expect(mapped.y).toBeCloseTo(q.y - 3, 9);
    }
  });

  it('recovers a scale', () => {
    const from = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];
    const to = from.map((q) => p(q.x * 2.5, q.y * 2.5));
    const h = homographyFromQuad(from, to)!;
    const mapped = applyHomography(h, p(3, 8));
    expect(mapped.x).toBeCloseTo(7.5, 9);
    expect(mapped.y).toBeCloseTo(20, 9);
  });

  it('recovers a genuine perspective map, not just an affine one', () => {
    // a trapezoid -> square, which no affine transform can do
    const from = [p(0, 0), p(100, 0), p(80, 60), p(20, 60)];
    const to = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)];
    const h = homographyFromQuad(from, to)!;
    from.forEach((q, i) => {
      const mapped = applyHomography(h, q);
      expect(mapped.x).toBeCloseTo(to[i]!.x, 6);
      expect(mapped.y).toBeCloseTo(to[i]!.y, 6);
    });
    // the perspective row is non-zero — this is not an affine transform
    expect(Math.abs(h[6]) + Math.abs(h[7])).toBeGreaterThan(1e-9);
  });

  it('maps every correspondence exactly', () => {
    const from = [p(120, 90), p(880, 140), p(830, 760), p(160, 700)];
    const to = outerRingReferencePoints(TARGET);
    const h = homographyFromQuad(from, to)!;
    from.forEach((q, i) => {
      const mapped = applyHomography(h, q);
      expect(mapped.x).toBeCloseTo(to[i]!.x, 6);
      expect(mapped.y).toBeCloseTo(to[i]!.y, 6);
    });
  });

  it('returns null for a degenerate quad instead of a matrix of NaNs', () => {
    const collinear = [p(0, 0), p(10, 0), p(20, 0), p(30, 0)];
    expect(homographyFromQuad(collinear, outerRingReferencePoints(TARGET))).toBeNull();

    const coincident = [p(0, 0), p(0, 0), p(10, 10), p(0, 10)];
    expect(homographyFromQuad(coincident, outerRingReferencePoints(TARGET))).toBeNull();
  });

  it('returns null for a NEARLY degenerate quad, not huge finite garbage', () => {
    // Exactly-collinear input produces NaNs, which the finiteness check would
    // catch on its own. A quad that is collinear to within 1e-14 does not:
    // it produces enormous but finite coefficients, and only the pivot guard
    // rejects it. This is the realistic case — a user dragging all four
    // handles onto very nearly the same line.
    const nearlyCollinear = [p(0, 0), p(10, 1e-14), p(20, 0), p(30, 1e-14)];
    expect(homographyFromQuad(nearlyCollinear, outerRingReferencePoints(TARGET))).toBeNull();
  });

  it('rejects the wrong number of correspondences', () => {
    expect(() => homographyFromQuad([p(0, 0)], [p(0, 0)])).toThrow(RangeError);
  });

  it('rejects non-finite corners', () => {
    const bad = [p(Number.NaN, 0), p(10, 0), p(10, 10), p(0, 10)];
    expect(() => homographyFromQuad(bad, outerRingReferencePoints(TARGET))).toThrow(RangeError);
  });
});

describe('transformFromCorners', () => {
  it('round-trips image px -> target mm -> image px', () => {
    const corners = [p(500, 60), p(940, 500), p(500, 940), p(60, 500)];
    const transform = transformFromCorners(corners, TARGET)!;
    expect(transform).not.toBeNull();

    for (const q of corners.concat([p(500, 500), p(300, 420)])) {
      const mm = applyHomography(transform.toMm, q);
      const back = applyHomography(transform.toImage, mm);
      expect(back.x).toBeCloseTo(q.x, 6);
      expect(back.y).toBeCloseTo(q.y, 6);
    }
  });

  it('puts the centre of a symmetric quad at the target centre', () => {
    const corners = [p(500, 60), p(940, 500), p(500, 940), p(60, 500)];
    const transform = transformFromCorners(corners, TARGET)!;
    const centre = applyHomography(transform.toMm, p(500, 500));
    expect(centre.x).toBeCloseTo(0, 6);
    expect(centre.y).toBeCloseTo(0, 6);
  });

  it('returns null on a degenerate quad', () => {
    expect(transformFromCorners([p(0, 0), p(1, 0), p(2, 0), p(3, 0)], TARGET)).toBeNull();
  });
});
