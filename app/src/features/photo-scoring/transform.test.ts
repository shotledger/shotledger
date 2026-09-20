import { SPSF_PISTOL_25M_PRECISION as TARGET, buildRectification } from '@shotledger/shared';

import { transformFromCorners } from './corners';
import { fromProjective, fromRectification, scaleTransform } from './transform';

const p = (x: number, y: number) => ({ x, y });

// A frontal, unrotated fit: 200mm black zone spanning 800px, centered at
// (500, 500) — so 1mm is 4px.
const rectification = buildRectification(
  { center: p(500, 500), majorAxis: 800, minorAxis: 800, rotationDeg: 0 },
  TARGET.referenceDiameterMm,
);

describe('fromRectification', () => {
  it('maps the ellipse center to the target center', () => {
    const t = fromRectification(rectification);
    expect(t.toMm(p(500, 500))).toEqual({ x: 0, y: 0 });
    expect(t.source).toBe('auto');
  });

  it('maps at the expected mm-per-px scale', () => {
    const t = fromRectification(rectification);
    // 800px across a 200mm zone -> 0.25 mm/px
    expect(t.toMm(p(600, 500)).x).toBeCloseTo(25, 9);
    expect(t.toMm(p(500, 620)).y).toBeCloseTo(30, 9);
  });

  it('round-trips px -> mm -> px', () => {
    const t = fromRectification(rectification);
    for (const q of [p(500, 500), p(123, 987), p(0, 0)]) {
      const back = t.toImage(t.toMm(q));
      expect(back.x).toBeCloseTo(q.x, 9);
      expect(back.y).toBeCloseTo(q.y, 9);
    }
  });
});

describe('fromProjective', () => {
  it('round-trips and reports the manual source', () => {
    const corners = [p(500, 60), p(940, 500), p(500, 940), p(60, 500)];
    const t = fromProjective(transformFromCorners(corners, TARGET)!);
    expect(t.source).toBe('manual');
    expect(t.toMm(p(500, 500)).x).toBeCloseTo(0, 6);

    const back = t.toImage(t.toMm(p(300, 420)));
    expect(back.x).toBeCloseTo(300, 6);
    expect(back.y).toBeCloseTo(420, 6);
  });
});

describe('scaleTransform', () => {
  it('keeps the same mm for the same relative position in a resized image', () => {
    const base = fromRectification(rectification);
    // the display is half the geometry image's size
    const scaled = scaleTransform(base, 0.5);
    expect(scaled.toMm(p(250, 250))).toEqual(base.toMm(p(500, 500)));
    expect(scaled.toMm(p(300, 250)).x).toBeCloseTo(base.toMm(p(600, 500)).x, 9);
  });

  it('scales the inverse direction to match', () => {
    const scaled = scaleTransform(fromRectification(rectification), 0.5);
    const back = scaled.toImage(scaled.toMm(p(321, 210)));
    expect(back.x).toBeCloseTo(321, 6);
    expect(back.y).toBeCloseTo(210, 6);
  });

  it('preserves the source', () => {
    expect(scaleTransform(fromRectification(rectification), 2).source).toBe('auto');
  });

  it('rejects a non-positive factor', () => {
    expect(() => scaleTransform(fromRectification(rectification), 0)).toThrow(RangeError);
    expect(() => scaleTransform(fromRectification(rectification), -1)).toThrow(RangeError);
  });
});
