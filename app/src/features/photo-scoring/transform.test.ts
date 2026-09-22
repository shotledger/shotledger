import { SPSF_PISTOL_25M_PRECISION as TARGET, buildRectification } from '@shotledger/shared';

import { transformFromCorners } from './corners';
import type { Homography } from './corners';
import {
  deserializeTransform,
  fromProjective,
  fromRectification,
  homographyOf,
  invertHomography,
  scaleTransform,
  serializeTransform,
} from './transform';

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

  it('scales a carried matrix with it', () => {
    const corners = [p(500, 60), p(940, 500), p(500, 940), p(60, 500)];
    const scaled = scaleTransform(fromProjective(transformFromCorners(corners, TARGET)!), 0.5);
    const viaMatrix = deserializeTransform(serializeTransform(scaled, 500, 500))!.transform;
    expect(viaMatrix.toImage(p(20, -30)).x).toBeCloseTo(scaled.toImage(p(20, -30)).x, 6);
  });
});

// A rotated, anisotropic fit, so every matrix entry is non-trivial.
const tilted = buildRectification(
  { center: p(900, 640), majorAxis: 820, minorAxis: 700, rotationDeg: 23 },
  TARGET.referenceDiameterMm,
);
const tiltedCorners = [p(510, 70), p(930, 520), p(470, 960), p(40, 480)];
const samples = [p(0, 0), p(12.5, -40), p(-230, 170), p(250, 250), p(-3.3, 0.7)];

function expectSameMapping(
  a: ReturnType<typeof fromRectification>,
  b: ReturnType<typeof fromRectification>,
) {
  for (const q of samples) {
    const pa = a.toImage(q);
    const pb = b.toImage(q);
    expect(pb.x).toBeCloseTo(pa.x, 6);
    expect(pb.y).toBeCloseTo(pa.y, 6);
    const back = b.toMm(pa);
    expect(back.x).toBeCloseTo(q.x, 6);
    expect(back.y).toBeCloseTo(q.y, 6);
  }
}

describe('invertHomography', () => {
  it('inverts a projective matrix', () => {
    const h = transformFromCorners(tiltedCorners, TARGET)!.toImage;
    const inv = invertHomography(h)!;
    // H * H^-1 = I up to scale; compare with the independently solved inverse.
    const other = transformFromCorners(tiltedCorners, TARGET)!.toMm;
    const s = inv[8];
    other.forEach((v, i) => expect(inv[i]! / s).toBeCloseTo(v / other[8], 9));
  });

  it('returns null for a singular matrix', () => {
    const singular: Homography = [1, 2, 3, 2, 4, 6, 0, 0, 1];
    expect(invertHomography(singular)).toBeNull();
  });
});

describe('homographyOf', () => {
  it('derives an affine matrix for the automatic path, last row 0 0 1', () => {
    const h = homographyOf(fromRectification(tilted));
    expect(h.slice(6)).toEqual([0, 0, 1]);
  });

  it('returns the carried matrix for the manual path', () => {
    const projective = transformFromCorners(tiltedCorners, TARGET)!;
    expect(homographyOf(fromProjective(projective))).toBe(projective.toImage);
  });
});

describe('serializeTransform / deserializeTransform', () => {
  it('round-trips the automatic transform', () => {
    const original = fromRectification(tilted);
    const json = serializeTransform(original, 2048, 1536);
    const parsed = deserializeTransform(json)!;
    expect(parsed.geometry).toMatchObject({ imageWidth: 2048, imageHeight: 1536, source: 'auto' });
    expect(parsed.transform.source).toBe('auto');
    expectSameMapping(original, parsed.transform);
  });

  it('round-trips the manual projective transform', () => {
    const original = fromProjective(transformFromCorners(tiltedCorners, TARGET)!);
    const parsed = deserializeTransform(serializeTransform(original, 1000, 1000))!;
    expect(parsed.geometry.source).toBe('manual');
    expectSameMapping(original, parsed.transform);
  });

  it('is plain JSON with no version field', () => {
    const json = serializeTransform(fromRectification(tilted), 2048, 1536);
    expect(Object.keys(JSON.parse(json)).sort()).toEqual([
      'imageHeight',
      'imageWidth',
      'mmToImage',
      'source',
    ]);
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['not JSON', '{nope'],
    ['a number', '42'],
    ['a short matrix', '{"imageWidth":1,"imageHeight":1,"source":"auto","mmToImage":[1,0,0]}'],
    [
      'an unknown source',
      '{"imageWidth":1,"imageHeight":1,"source":"guess","mmToImage":[1,0,0,0,1,0,0,0,1]}',
    ],
    [
      'a zero width',
      '{"imageWidth":0,"imageHeight":1,"source":"auto","mmToImage":[1,0,0,0,1,0,0,0,1]}',
    ],
    [
      'a singular matrix',
      '{"imageWidth":1,"imageHeight":1,"source":"auto","mmToImage":[1,2,3,2,4,6,0,0,1]}',
    ],
  ])('returns null for %s', (_label, json) => {
    expect(deserializeTransform(json)).toBeNull();
  });
});
