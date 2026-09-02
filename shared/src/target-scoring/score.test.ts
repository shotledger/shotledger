import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CALIBER_MM, scoreHole, type Hole } from './score';
import {
  SPSF_PISTOL_25M_PRECISION,
  SPSF_SNABBSKJUTNING_25M,
  type TargetFaceDefinition,
} from './targets';

const CALIBER_22 = CALIBER_MM['.22'] as number; // 5.6mm, known-present preset key

function holeAtRadius(radiusMm: number, caliberMm = CALIBER_22): Hole {
  return { centerMm: { x: radiusMm, y: 0 }, caliberMm };
}

describe('CALIBER_MM', () => {
  it('has the documented preset diameters', () => {
    expect(CALIBER_MM['.22']).toBe(5.6);
    expect(CALIBER_MM['9mm']).toBe(9.0);
    expect(CALIBER_MM['.32']).toBe(7.65);
    expect(CALIBER_MM['.38']).toBe(9.07);
    expect(CALIBER_MM['.45']).toBe(11.43);
  });
});

describe('scoreHole — precision face', () => {
  it('SC1: dead center scores X with the full X-ring margin', () => {
    const result = scoreHole(holeAtRadius(0), SPSF_PISTOL_25M_PRECISION);
    expect(result).toEqual({
      ringLabel: 'X',
      value: 10,
      isInnerTen: true,
      marginMm: 12.5,
      edgeCall: false,
    });
  });

  it('SC2: near edge exactly on the X-ring boundary scores X (tangent counts higher)', () => {
    // radius 15.30 -> near edge 15.30 - 2.8 = 12.50 = X radius exactly
    const result = scoreHole(holeAtRadius(15.3), SPSF_PISTOL_25M_PRECISION);
    expect(result.ringLabel).toBe('X');
    expect(result.marginMm).toBeCloseTo(0, 10);
    expect(result.edgeCall).toBe(true);
  });

  it('SC3: 0.01mm past the X-ring boundary flips to 10', () => {
    const result = scoreHole(holeAtRadius(15.31), SPSF_PISTOL_25M_PRECISION);
    expect(result.ringLabel).toBe('10');
  });

  it('SC4: far outside ring 1 scores a miss with margin past the outermost ring', () => {
    const result = scoreHole(holeAtRadius(400), SPSF_PISTOL_25M_PRECISION);
    // near edge = 400 - 2.8 = 397.2; ring 1 radius 250 -> margin = 397.2 - 250 = 147.2
    expect(result).toEqual({
      ringLabel: '0',
      value: 0,
      isInnerTen: false,
      marginMm: 147.2,
      edgeCall: false,
    });
  });

  it('SC5: near edge exactly on ring 1s outer boundary scores 1, not a miss', () => {
    // ring 1 radius = 250; near edge 250 => radius = 250 + 2.8 = 252.8
    const result = scoreHole(holeAtRadius(252.8), SPSF_PISTOL_25M_PRECISION);
    expect(result.ringLabel).toBe('1');
    expect(result.marginMm).toBeCloseTo(0, 10);
  });

  it('SC6: margin 0.4mm inside a boundary is an edge call', () => {
    // ring 9 radius 50; want near edge = 50 - 0.4 = 49.6 => radius = 49.6 + 2.8 = 52.4
    const result = scoreHole(holeAtRadius(52.4), SPSF_PISTOL_25M_PRECISION);
    expect(result.ringLabel).toBe('9');
    expect(result.marginMm).toBeCloseTo(0.4, 6);
    expect(result.edgeCall).toBe(true);
  });

  it('SC7: margin exactly 1.0mm is NOT an edge call (threshold is strict <)', () => {
    // ring 9 radius 50; near edge 50-1 = 49 => radius = 49+2.8 = 51.8
    const result = scoreHole(holeAtRadius(51.8), SPSF_PISTOL_25M_PRECISION);
    expect(result.marginMm).toBeCloseTo(1.0, 6);
    expect(result.edgeCall).toBe(false);
  });

  it('SC8: margin 1.01mm inside is not an edge call', () => {
    const result = scoreHole(holeAtRadius(51.79), SPSF_PISTOL_25M_PRECISION);
    expect(result.marginMm).toBeGreaterThan(1.0);
    expect(result.edgeCall).toBe(false);
  });

  it('SC9: a miss never raises an edge call regardless of how close the margin is', () => {
    // near edge 0.3mm past ring 1 (radius 250): radius = 250 + 0.3 + 2.8 = 253.1
    const result = scoreHole(holeAtRadius(253.1), SPSF_PISTOL_25M_PRECISION);
    expect(result.ringLabel).toBe('0');
    expect(result.marginMm).toBeCloseTo(0.3, 6);
    expect(result.edgeCall).toBe(false);
  });

  it('SC12: a non-positive caliber throws RangeError', () => {
    expect(() => scoreHole(holeAtRadius(10, 0), SPSF_PISTOL_25M_PRECISION)).toThrow(
      /caliberMm must be > 0/,
    );
    expect(() => scoreHole(holeAtRadius(10, -1), SPSF_PISTOL_25M_PRECISION)).toThrow(
      /caliberMm must be > 0/,
    );
  });

  it('SC13: a target with no rings throws RangeError', () => {
    const empty: TargetFaceDefinition = {
      id: 'empty',
      rings: [],
      referenceDiameterMm: 200,
      referenceIsSolidBlack: true,
    };
    expect(() => scoreHole(holeAtRadius(10), empty)).toThrow(/target has no rings/);
  });
});

describe('SC10: tangent flip points at every precision ring boundary', () => {
  const face = SPSF_PISTOL_25M_PRECISION;
  const boundaries = face.rings.map((r, i) => ({
    higherLabel: r.label,
    lowerLabel: face.rings[i + 1]?.label ?? '0',
    ringRadiusMm: r.diameterMm / 2,
  }));

  it.each(boundaries)(
    'boundary $higherLabel/$lowerLabel: exact radius scores $higherLabel, +0.01mm scores $lowerLabel',
    ({ higherLabel, lowerLabel, ringRadiusMm }) => {
      const exactRadius = ringRadiusMm + CALIBER_22 / 2;
      const pastRadius = exactRadius + 0.01;

      const onBoundary = scoreHole(holeAtRadius(exactRadius), face);
      expect(onBoundary.ringLabel).toBe(higherLabel);

      const pastBoundary = scoreHole(holeAtRadius(pastRadius), face);
      expect(pastBoundary.ringLabel).toBe(lowerLabel);
    },
  );
});

describe('SC11: milsnabb face uses the same rule with different diameters', () => {
  const face = SPSF_SNABBSKJUTNING_25M;

  it('X/10 boundary flips exactly on the X-ring radius (25mm)', () => {
    const onBoundary = scoreHole(holeAtRadius(25 + CALIBER_22 / 2), face);
    expect(onBoundary.ringLabel).toBe('X');
    const past = scoreHole(holeAtRadius(25 + CALIBER_22 / 2 + 0.01), face);
    expect(past.ringLabel).toBe('10');
  });

  it('outermost ring 5 (radius 250) vs a miss', () => {
    const onBoundary = scoreHole(holeAtRadius(250 + CALIBER_22 / 2), face);
    expect(onBoundary.ringLabel).toBe('5');
    const past = scoreHole(holeAtRadius(250 + CALIBER_22 / 2 + 0.01), face);
    expect(past.ringLabel).toBe('0');
  });
});

describe('scoreHole properties', () => {
  const faces = [SPSF_PISTOL_25M_PRECISION, SPSF_SNABBSKJUTNING_25M];

  it('SP-P1: value is non-increasing as radius grows', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...faces),
        fc.float({ min: 0, max: Math.fround(600), noNaN: true }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(1), noNaN: true }),
        (face, radius, deltaFraction) => {
          const caliber = CALIBER_22;
          const a = scoreHole(holeAtRadius(radius, caliber), face);
          const b = scoreHole(holeAtRadius(radius + deltaFraction, caliber), face);
          expect(b.value).toBeLessThanOrEqual(a.value);
        },
      ),
    );
  });

  it('SP-P2: marginMm is always >= 0', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...faces),
        fc.float({ min: 0, max: Math.fround(600), noNaN: true }),
        (face, radius) => {
          const result = scoreHole(holeAtRadius(radius), face);
          expect(result.marginMm).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('SP-P3: edgeCall implies scored (not a miss) and marginMm < 1', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...faces),
        fc.float({ min: 0, max: Math.fround(600), noNaN: true }),
        (face, radius) => {
          const result = scoreHole(holeAtRadius(radius), face);
          if (result.edgeCall) {
            expect(result.ringLabel).not.toBe('0');
            expect(result.marginMm).toBeLessThan(1);
          }
        },
      ),
    );
  });
});
