import { SPSF_PISTOL_25M_PRECISION as TARGET } from '@shotledger/shared';

import {
  applyHomography,
  homographyFromQuad,
  ringOverlay,
  ringReferencePoints,
  transformFromCorners,
} from './corners';

const p = (x: number, y: number) => ({ x, y });

describe('ringReferencePoints', () => {
  it('is the outermost ring extremes, top/right/bottom/left', () => {
    // precision face: ring 1 is 500mm across, so r = 250mm
    expect(ringReferencePoints(TARGET)).toEqual([p(0, -250), p(250, 0), p(0, 250), p(-250, 0)]);
  });

  it('uses the named ring when the outermost is not in frame', () => {
    // The 7 ring is 200mm across on the precision face, so r = 100mm.
    expect(ringReferencePoints(TARGET, '7')).toEqual([
      p(0, -100),
      p(100, 0),
      p(0, 100),
      p(-100, 0),
    ]);
  });

  it('throws for a target with no rings', () => {
    expect(() => ringReferencePoints({ rings: [] })).toThrow(RangeError);
  });

  it('throws rather than silently falling back for an unknown ring', () => {
    expect(() => ringReferencePoints(TARGET, '11')).toThrow(RangeError);
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
    const to = ringReferencePoints(TARGET);
    const h = homographyFromQuad(from, to)!;
    from.forEach((q, i) => {
      const mapped = applyHomography(h, q);
      expect(mapped.x).toBeCloseTo(to[i]!.x, 6);
      expect(mapped.y).toBeCloseTo(to[i]!.y, 6);
    });
  });

  it('returns null for a degenerate quad instead of a matrix of NaNs', () => {
    const collinear = [p(0, 0), p(10, 0), p(20, 0), p(30, 0)];
    expect(homographyFromQuad(collinear, ringReferencePoints(TARGET))).toBeNull();

    const coincident = [p(0, 0), p(0, 0), p(10, 10), p(0, 10)];
    expect(homographyFromQuad(coincident, ringReferencePoints(TARGET))).toBeNull();
  });

  it('returns null for a NEARLY degenerate quad, not huge finite garbage', () => {
    // Exactly-collinear input produces NaNs, which the finiteness check would
    // catch on its own. A quad that is collinear to within 1e-14 does not:
    // it produces enormous but finite coefficients, and only the pivot guard
    // rejects it. This is the realistic case — a user dragging all four
    // handles onto very nearly the same line.
    const nearlyCollinear = [p(0, 0), p(10, 1e-14), p(20, 0), p(30, 1e-14)];
    expect(homographyFromQuad(nearlyCollinear, ringReferencePoints(TARGET))).toBeNull();
  });

  it('rejects the wrong number of correspondences', () => {
    expect(() => homographyFromQuad([p(0, 0)], [p(0, 0)])).toThrow(RangeError);
  });

  it('rejects non-finite corners', () => {
    const bad = [p(Number.NaN, 0), p(10, 0), p(10, 10), p(0, 10)];
    expect(() => homographyFromQuad(bad, ringReferencePoints(TARGET))).toThrow(RangeError);
  });
});

describe('transformFromCorners, on a ring other than the outermost', () => {
  // The failure this exists to prevent: corners placed on the 7 ring while the
  // code assumes the 1 ring scales every measurement by 500/200 = 2.5x, so a
  // hole 50mm from center reads as 125mm — an X scored as a 6.
  const corners = [p(100, 0), p(200, 100), p(100, 200), p(0, 100)];

  it('reads the scale from the ring the user says they used', () => {
    const onSeven = transformFromCorners(corners, TARGET, '7')!;
    // The quad is 100px from center to edge and the 7 ring is 100mm to edge.
    expect(applyHomography(onSeven.toMm, p(150, 50)).y).toBeCloseTo(-50, 6);
  });

  it('would be 2.5x wrong if the choice were ignored', () => {
    const assumedOutermost = transformFromCorners(corners, TARGET)!;
    const onSeven = transformFromCorners(corners, TARGET, '7')!;
    const wrong = applyHomography(assumedOutermost.toMm, p(150, 50)).y;
    const right = applyHomography(onSeven.toMm, p(150, 50)).y;
    expect(wrong / right).toBeCloseTo(2.5, 6);
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

  it('puts the center of a symmetric quad at the target center', () => {
    const corners = [p(500, 60), p(940, 500), p(500, 940), p(60, 500)];
    const transform = transformFromCorners(corners, TARGET)!;
    const center = applyHomography(transform.toMm, p(500, 500));
    expect(center.x).toBeCloseTo(0, 6);
    expect(center.y).toBeCloseTo(0, 6);
  });

  it('returns null on a degenerate quad', () => {
    expect(transformFromCorners([p(0, 0), p(1, 0), p(2, 0), p(3, 0)], TARGET)).toBeNull();
  });
});

describe('ringOverlay', () => {
  // Corners 100px from (100, 100), on the 7 ring (radius 100mm): 1 px per mm.
  const corners = [p(100, 0), p(200, 100), p(100, 200), p(0, 100)];

  it('draws the picked ring through the four points', () => {
    const overlay = ringOverlay(corners, TARGET, '7')!;
    const seven = overlay.rings.find((ring) => ring.picked)!;
    expect(seven.label).toBe('7');
    for (const point of seven.points) {
      expect(Math.hypot(point.x - 100, point.y - 100)).toBeCloseTo(100, 6);
    }
    // Points 0, 18, 36, 54 of 72 are right, bottom, left, top.
    expect(seven.points[18]!.x).toBeCloseTo(100, 6);
    expect(seven.points[18]!.y).toBeCloseTo(200, 6);
  });

  it('draws every other ring at its own scale, and only the picked one is marked', () => {
    const overlay = ringOverlay(corners, TARGET, '7')!;
    expect(overlay.rings).toHaveLength(TARGET.rings.length);
    expect(overlay.rings.filter((ring) => ring.picked)).toHaveLength(1);
    const ten = overlay.rings.find((ring) => ring.label === '10')!;
    const tenRadius = TARGET.rings.find((ring) => ring.label === '10')!.diameterMm / 2;
    expect(Math.hypot(ten.points[0]!.x - 100, ten.points[0]!.y - 100)).toBeCloseTo(tenRadius, 6);
  });

  it('shows a wrong ring pick as rings that miss the points', () => {
    // Same points, but said to be on the outermost ring: the 7 ring is then
    // drawn at 200/500 of the quad, well inside the handles.
    const overlay = ringOverlay(corners, TARGET, '1')!;
    const seven = overlay.rings.find((ring) => ring.label === '7')!;
    expect(Math.hypot(seven.points[0]!.x - 100, seven.points[0]!.y - 100)).toBeCloseTo(40, 6);
  });

  it('puts the center where the perspective puts it, not midway between the handles', () => {
    // Left and right sit low, as in a photo shot from below. Diameters stay
    // straight lines under a homography, so the center is where top-bottom
    // crosses left-right: (100, 140), not the handles' midpoint (100, 110).
    const tilted = [p(100, 20), p(200, 140), p(100, 200), p(0, 140)];
    const overlay = ringOverlay(tilted, TARGET, '7')!;
    expect(overlay.center.x).toBeCloseTo(100, 6);
    expect(overlay.center.y).toBeCloseTo(140, 6);
  });

  it('returns null on a degenerate quad', () => {
    expect(ringOverlay([p(0, 0), p(1, 0), p(2, 0), p(3, 0)], TARGET, '7')).toBeNull();
  });
});
