import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import {
  applyRefinement,
  buildRectification,
  coarseToFineRefine,
  imageToTargetMm,
  refineRectification,
  scoreRadialProfile,
  targetMmToImage,
  type EllipseFit,
  type RectificationTransform,
} from './geometry';

// spec table GB — buildRectification
describe('buildRectification', () => {
  it('GB1: circular ellipse yields a uniform scale', () => {
    const ellipse: EllipseFit = {
      center: { x: 100, y: 100 },
      majorAxis: 800,
      minorAxis: 800,
      rotationDeg: 0,
    };
    const t = buildRectification(ellipse, 200);
    expect(t.m[0]).toBeCloseTo(0.25, 10);
    expect(t.m[3]).toBeCloseTo(0.25, 10);
    expect(t.m[1]).toBeCloseTo(0, 10);
    expect(t.m[2]).toBeCloseTo(0, 10);
    expect(t.center).toEqual({ x: 100, y: 100 });
    expect(t.offset).toEqual({ x: 0, y: 0 });
  });

  it('GB2: rotation 90 degrees rotates the axes exactly', () => {
    const ellipse: EllipseFit = {
      center: { x: 0, y: 0 },
      majorAxis: 800,
      minorAxis: 800,
      rotationDeg: 90,
    };
    const t = buildRectification(ellipse, 200);
    // R = [[cos90, sin90],[-sin90, cos90]] = [[0,1],[-1,0]]; S = diag(0.25,0.25); M = S@R
    expect(t.m[0]).toBeCloseTo(0, 10);
    expect(t.m[1]).toBeCloseTo(0.25, 10);
    expect(t.m[2]).toBeCloseTo(-0.25, 10);
    expect(t.m[3]).toBeCloseTo(0, 10);
  });

  it('GB3: anisotropic ellipse produces different per-axis scale', () => {
    const ellipse: EllipseFit = {
      center: { x: 0, y: 0 },
      majorAxis: 1000,
      minorAxis: 800,
      rotationDeg: 0,
    };
    const t = buildRectification(ellipse, 200);
    // s0 = 200/800 = 0.25 (minorAxis pairs with row 0); s1 = 200/1000 = 0.2
    expect(t.m[0]).toBeCloseTo(0.25, 10);
    expect(t.m[3]).toBeCloseTo(0.2, 10);
    expect(t.m[0]).not.toBeCloseTo(t.m[3], 5);
  });

  it('GB4: non-positive axes or reference diameter throw RangeError', () => {
    const base: EllipseFit = {
      center: { x: 0, y: 0 },
      majorAxis: 100,
      minorAxis: 100,
      rotationDeg: 0,
    };
    expect(() => buildRectification({ ...base, majorAxis: 0 }, 200)).toThrow(
      /majorAxis must be > 0/,
    );
    expect(() => buildRectification({ ...base, majorAxis: -1 }, 200)).toThrow(
      /majorAxis must be > 0/,
    );
    expect(() => buildRectification({ ...base, minorAxis: 0 }, 200)).toThrow(
      /minorAxis must be > 0/,
    );
    expect(() => buildRectification({ ...base, minorAxis: -1 }, 200)).toThrow(
      /minorAxis must be > 0/,
    );
    expect(() => buildRectification(base, 0)).toThrow(/referenceDiameterMm must be > 0/);
    expect(() => buildRectification(base, -5)).toThrow(/referenceDiameterMm must be > 0/);
  });

  it('GB5: minorAxis > majorAxis throws RangeError', () => {
    const ellipse: EllipseFit = {
      center: { x: 0, y: 0 },
      majorAxis: 100,
      minorAxis: 200,
      rotationDeg: 0,
    };
    expect(() => buildRectification(ellipse, 200)).toThrow(/minorAxis must be <= majorAxis/);
  });
});

// spec table GT — imageToTargetMm / targetMmToImage
describe('imageToTargetMm / targetMmToImage', () => {
  const identity: RectificationTransform = {
    center: { x: 0, y: 0 },
    m: [1, 0, 0, 1],
    offset: { x: 0, y: 0 },
  };

  it('GT1: identity transform passes points through unchanged', () => {
    expect(imageToTargetMm(identity, { x: 5, y: 3 })).toEqual({ x: 5, y: 3 });
  });

  it('GT2: round-trip through a non-trivial transform', () => {
    const ellipse: EllipseFit = {
      center: { x: 50, y: 40 },
      majorAxis: 1000,
      minorAxis: 800,
      rotationDeg: 17,
    };
    const t = buildRectification(ellipse, 200);
    const p = { x: 123, y: -45 };
    const roundTripped = targetMmToImage(t, imageToTargetMm(t, p));
    expect(roundTripped.x).toBeCloseTo(p.x, 8);
    expect(roundTripped.y).toBeCloseTo(p.y, 8);
  });

  it('targetMmToImage subtracts a non-zero offset before inverting (not adds it)', () => {
    const t: RectificationTransform = {
      center: { x: 0, y: 0 },
      m: [1, 0, 0, 1],
      offset: { x: 5, y: -3 },
    };
    // mm (5,-3) is exactly the offset, so the residual after subtracting it is (0,0) ->
    // image (0,0). Adding the offset instead would produce (10,-6).
    expect(targetMmToImage(t, { x: 5, y: -3 })).toEqual({ x: 0, y: 0 });
  });

  it('GT3: the ellipse center maps to the transform offset', () => {
    const ellipse: EllipseFit = {
      center: { x: 50, y: 40 },
      majorAxis: 1000,
      minorAxis: 800,
      rotationDeg: 17,
    };
    const t = buildRectification(ellipse, 200);
    const mm = imageToTargetMm(t, ellipse.center);
    expect(mm.x).toBeCloseTo(t.offset.x, 10);
    expect(mm.y).toBeCloseTo(t.offset.y, 10);
  });
});

// spec table GR — refineRectification
describe('refineRectification', () => {
  const identity: RectificationTransform = {
    center: { x: 0, y: 0 },
    m: [1, 0, 0, 1],
    offset: { x: 0, y: 0 },
  };

  it('GR1: dx/dy shift the mm output by exactly -(dx,dy)', () => {
    const refined = refineRectification(identity, 1, 2, 1);
    const mm = imageToTargetMm(refined, { x: 10, y: 10 });
    expect(mm).toEqual({ x: 9, y: 8 });
  });

  it('GR2: scale alone doubles the mm output', () => {
    const refined = refineRectification(identity, 0, 0, 2);
    const mm = imageToTargetMm(refined, { x: 10, y: 10 });
    expect(mm).toEqual({ x: 20, y: 20 });
  });

  it('GR3: combined dx/dy/scale matches the closed-form formula', () => {
    const ellipse: EllipseFit = {
      center: { x: 10, y: 10 },
      majorAxis: 900,
      minorAxis: 700,
      rotationDeg: 5,
    };
    const t = buildRectification(ellipse, 200);
    const refined = refineRectification(t, 3, -2, 1.1);
    const p = { x: 55, y: -20 };
    const original = imageToTargetMm(t, p);
    const expected = { x: 1.1 * (original.x - 3), y: 1.1 * (original.y - -2) };
    const actual = imageToTargetMm(refined, p);
    expect(actual.x).toBeCloseTo(expected.x, 8);
    expect(actual.y).toBeCloseTo(expected.y, 8);
  });

  it('GR4: non-positive scale throws RangeError', () => {
    expect(() => refineRectification(identity, 0, 0, 0)).toThrow(/scale must be > 0/);
    expect(() => refineRectification(identity, 0, 0, -1)).toThrow(/scale must be > 0/);
  });

  it('GR5: refining by (0,0,1) is the identity refinement', () => {
    const ellipse: EllipseFit = {
      center: { x: 10, y: 10 },
      majorAxis: 900,
      minorAxis: 700,
      rotationDeg: 5,
    };
    const t = buildRectification(ellipse, 200);
    const refined = refineRectification(t, 0, 0, 1);
    const p = { x: 55, y: -20 };
    const before = imageToTargetMm(t, p);
    const after = imageToTargetMm(refined, p);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });
});

// spec table SP — scoreRadialProfile
describe('scoreRadialProfile', () => {
  it('SP1: finds the peak at each ring radius sample index', () => {
    // samplesPerMm = 1; ring radii 10, 20; put spikes exactly there
    const profile = new Array(30).fill(0);
    profile[10] = 5;
    profile[20] = 7;
    const score = scoreRadialProfile(profile, 1, [10, 20]);
    expect(score).toBeCloseTo((5 + 7) / 2, 10);
  });

  it('SP2: a radius past the profile length is excluded from the average', () => {
    const profile = new Array(15).fill(0);
    profile[10] = 5;
    // radius 20 needs samples up to index 22, profile only has 15
    const score = scoreRadialProfile(profile, 1, [10, 20]);
    expect(score).toBeCloseTo(5, 10);
  });

  it('SP3: every radius past the profile returns -Infinity', () => {
    const profile = new Array(5).fill(1);
    const score = scoreRadialProfile(profile, 1, [10, 20]);
    expect(score).toBe(-Infinity);
  });

  it('SP4: default windowSamples behaves as 2 (matches r-2..r+2 inclusive)', () => {
    const profile = new Array(20).fill(0);
    profile[12] = 9; // within [10-2,10+2] = [8,12]
    const withDefault = scoreRadialProfile(profile, 1, [10]);
    const withExplicit = scoreRadialProfile(profile, 1, [10], 2);
    expect(withDefault).toBe(withExplicit);
    expect(withDefault).toBeCloseTo(9, 10);
  });

  it('SP5: empty ringRadiiMm returns -Infinity', () => {
    const profile = [1, 2, 3];
    expect(scoreRadialProfile(profile, 1, [])).toBe(-Infinity);
  });

  it('samplesPerMm multiplies (not divides) the ring radius into a sample index', () => {
    // radius 10mm at 4 samples/mm -> sample index 40, not 10/4=2.5.
    const profile = new Array(50).fill(0);
    profile[40] = 8;
    expect(scoreRadialProfile(profile, 4, [10])).toBeCloseTo(8, 10);
  });

  it('the window lower bound clamps to 0 (Math.max) rather than going negative (Math.min)', () => {
    // r=1, windowSamples=2 -> naive lo = -1, which must clamp to 0. `arr[-1] = x` sets a
    // real, bracket-readable property on a JS array (just not one `length` counts), so an
    // unclamped loop starting at i=-1 would pick it up — the same way a plain out-of-bounds
    // negative index would silently read past the front of a native buffer.
    const profile = [0, 0, 9, 0, 0, 0];
    (profile as unknown as Record<number, number>)[-1] = 999;
    expect(scoreRadialProfile(profile, 1, [1])).toBeCloseTo(9, 10);
  });

  it('SP6: a profile whose length exactly equals the window upper bound is still included', () => {
    // r=10, windowSamples=2 => hi = 13. profile.length === hi exactly (indices 0..12 valid).
    const profile = new Array(13).fill(0);
    profile[12] = 9;
    expect(scoreRadialProfile(profile, 1, [10])).toBeCloseTo(9, 10);
  });

  it('SP7: the window upper bound is exclusive — a value one past it is never picked up', () => {
    // r=10, windowSamples=2 => window is [8,13). A large value at index 13 (one past the
    // window) must not affect the result even though the profile is long enough to hold it.
    const profile = new Array(20).fill(0);
    profile[12] = 9; // legitimate in-window value
    profile[13] = 999; // just outside the window
    expect(scoreRadialProfile(profile, 1, [10])).toBeCloseTo(9, 10);
  });
});

// spec table CF — coarseToFineRefine
describe('coarseToFineRefine', () => {
  it('CF1: converges near a smooth optimum inside the default search window', () => {
    const evaluate = (dx: number, dy: number, scale: number) =>
      -((dx - 3) ** 2 + (dy - 1) ** 2 + (scale - 1.05) ** 2);
    const result = coarseToFineRefine(evaluate);
    expect(result.dxMm).toBeCloseTo(3, 0);
    expect(result.dyMm).toBeCloseTo(1, 0);
    expect(result.scale).toBeCloseTo(1.05, 1);
    expect(result.score).toBeCloseTo(evaluate(result.dxMm, result.dyMm, result.scale), 10);
  });

  it('CF2: a constant evaluate never throws and returns a deterministic candidate', () => {
    const result = coarseToFineRefine(() => 42);
    expect(result.score).toBe(42);
    expect(Number.isFinite(result.dxMm)).toBe(true);
    expect(Number.isFinite(result.dyMm)).toBe(true);
    expect(Number.isFinite(result.scale)).toBe(true);
  });

  it('CF6: a constant evaluate keeps the FIRST grid point per iteration (strict > tie-break)', () => {
    // The first point of grid(center, halfWidth, step) is always center - halfWidth, so with
    // every candidate scoring equally, a strict `>` comparison never moves off it. This also
    // pins down each iteration's searchMm (the corrected best is always prevBest - searchMm).
    const result = coarseToFineRefine(() => 42, {
      initialSearchMm: 10,
      initialStepMm: 2,
      scaleWindow: 0.12,
      iterations: 3,
    });
    // iter1: searchMm=10 -> best=-10; stepMm becomes max(0.5,2/3)=2/3, searchMm2=2*1.5=3
    // iter2: searchMm=3 -> best=-13; stepMm becomes max(0.5,(2/3)/3)=0.5, searchMm3=(2/3)*1.5=1
    // iter3: searchMm=1 -> best=-14
    expect(result.dxMm).toBeCloseTo(-14, 6);
    expect(result.dyMm).toBeCloseTo(-14, 6);
    // scale's half-width (scaleWindow) never shrinks across iterations, so each iteration's
    // first scale point is (previous best) - 0.12.
    expect(result.scale).toBeCloseTo(1 - 0.12 - 0.12 - 0.12, 6);
    expect(result.score).toBe(42);
  });

  it('CF7: iterations=0 runs no grid pass and returns the unrefined identity with score -Infinity', () => {
    const evaluate = vi.fn(() => 42);
    const result = coarseToFineRefine(evaluate, { iterations: 0 });
    expect(evaluate).not.toHaveBeenCalled();
    expect(result).toEqual({ dxMm: 0, dyMm: 0, scale: 1, score: -Infinity });
  });

  it('CF8: the stepMm recurrence and scaleStep formula produce the documented grid spacing', () => {
    // Chosen so iteration 2's stepMm = max(0.5, 6/3) = 2 (distinguishes */ mutants on the
    // shrink formula and Math.max/Math.min) and scaleStep = (0.02*2)/2 = 0.02 (distinguishes
    // the scaleStep arithmetic mutants — with stepMm=2, */ give different values: 0.08 vs 0.005).
    const calls: Array<[number, number, number]> = [];
    const evaluate = (dx: number, dy: number, scale: number): number => {
      calls.push([dx, dy, scale]);
      return 0;
    };
    coarseToFineRefine(evaluate, {
      initialSearchMm: 4,
      initialStepMm: 6,
      scaleWindow: 0.1,
      iterations: 2,
    });

    // iter1 grid: dx/dy have 2 points each (round(8/6)=1 -> 2 points), scale has 4 points
    // (round(0.2/0.06)=3 -> 4 points) => 2*2*4 = 16 calls before iteration 2 starts.
    const iter2Calls = calls.slice(16);
    expect(iter2Calls.length).toBeGreaterThan(0);

    const dxValues = [...new Set(iter2Calls.map((c) => c[0]))].sort((a, b) => a - b);
    const scaleValues = [...new Set(iter2Calls.map((c) => c[2]))].sort((a, b) => a - b);

    expect(dxValues.length).toBeGreaterThan(1);
    expect(scaleValues.length).toBeGreaterThan(1);
    // stepMm after iter1 = max(0.5, 6/3) = 2
    expect((dxValues[1] as number) - (dxValues[0] as number)).toBeCloseTo(2, 6);
    // scaleStep = (0.02*2)/2
    expect((scaleValues[1] as number) - (scaleValues[0] as number)).toBeCloseTo(0.02, 6);
  });

  it('CF3: iterations=1 restricts the result to the first grid pass', () => {
    const spy = vi.fn((_dx: number, _dy: number, _scale: number) => 0);
    coarseToFineRefine(spy, { iterations: 1, initialSearchMm: 4, initialStepMm: 2 });
    // grid over dx in {-4,-2,0,2,4} (5) * dy (5) * scale grid; just check it ran a bounded, single-iteration count
    const dxValuesUsed = new Set(spy.mock.calls.map((c) => c[0]));
    expect(dxValuesUsed).toEqual(new Set([-4, -2, 0, 2, 4]));
  });

  it('CF4: omitting options entirely matches passing the documented defaults', () => {
    const evaluate = (dx: number, dy: number, scale: number) =>
      -((dx - 1) ** 2 + (dy - 1) ** 2 + (scale - 1) ** 2);
    const withDefaults = coarseToFineRefine(evaluate, {
      initialSearchMm: 10,
      initialStepMm: 2,
      scaleWindow: 0.12,
      iterations: 3,
    });
    const omitted = coarseToFineRefine(evaluate);
    expect(omitted).toEqual(withDefaults);
  });

  it('CF5: evaluate is never called with a non-positive scale', () => {
    const seen: number[] = [];
    coarseToFineRefine((_dx, _dy, scale) => {
      seen.push(scale);
      return 0;
    });
    expect(seen.every((s) => s > 0)).toBe(true);
  });
});

describe('geometry properties', () => {
  const ellipseArb = fc
    .record({
      centerX: fc.float({ min: Math.fround(-500), max: Math.fround(500), noNaN: true }),
      centerY: fc.float({ min: Math.fround(-500), max: Math.fround(500), noNaN: true }),
      minorAxis: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true }),
      extraAxis: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
      rotationDeg: fc.float({ min: Math.fround(-360), max: Math.fround(360), noNaN: true }),
      referenceDiameterMm: fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true }),
    })
    .map((r) => ({
      ellipse: {
        center: { x: r.centerX, y: r.centerY },
        minorAxis: r.minorAxis,
        majorAxis: r.minorAxis + r.extraAxis,
        rotationDeg: r.rotationDeg,
      } satisfies EllipseFit,
      referenceDiameterMm: r.referenceDiameterMm,
    }));

  const pointArb = fc.record({
    x: fc.float({ min: Math.fround(-2000), max: Math.fround(2000), noNaN: true }),
    y: fc.float({ min: Math.fround(-2000), max: Math.fround(2000), noNaN: true }),
  });

  it('GP1: round-trip invertibility', () => {
    fc.assert(
      fc.property(ellipseArb, pointArb, ({ ellipse, referenceDiameterMm }, p) => {
        const t = buildRectification(ellipse, referenceDiameterMm);
        const roundTripped = targetMmToImage(t, imageToTargetMm(t, p));
        expect(roundTripped.x).toBeCloseTo(p.x, 3);
        expect(roundTripped.y).toBeCloseTo(p.y, 3);
      }),
    );
  });

  it('GP2: refineRectification composes', () => {
    fc.assert(
      fc.property(
        ellipseArb,
        pointArb,
        fc.record({
          dx1: fc.float({ min: Math.fround(-20), max: Math.fround(20), noNaN: true }),
          dy1: fc.float({ min: Math.fround(-20), max: Math.fround(20), noNaN: true }),
          s1: fc.float({ min: Math.fround(0.5), max: Math.fround(1.5), noNaN: true }),
          dx2: fc.float({ min: Math.fround(-20), max: Math.fround(20), noNaN: true }),
          dy2: fc.float({ min: Math.fround(-20), max: Math.fround(20), noNaN: true }),
          s2: fc.float({ min: Math.fround(0.5), max: Math.fround(1.5), noNaN: true }),
        }),
        ({ ellipse, referenceDiameterMm }, p, refinements) => {
          const t = buildRectification(ellipse, referenceDiameterMm);
          const composed = refineRectification(
            refineRectification(t, refinements.dx1, refinements.dy1, refinements.s1),
            refinements.dx2,
            refinements.dy2,
            refinements.s2,
          );
          const original = imageToTargetMm(t, p);
          const expected = {
            x: refinements.s2 * (refinements.s1 * (original.x - refinements.dx1) - refinements.dx2),
            y: refinements.s2 * (refinements.s1 * (original.y - refinements.dy1) - refinements.dy2),
          };
          const actual = imageToTargetMm(composed, p);
          expect(actual.x).toBeCloseTo(expected.x, 3);
          expect(actual.y).toBeCloseTo(expected.y, 3);
        },
      ),
    );
  });

  it('GP3: scoreRadialProfile is invariant to padding the profile tail', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 0, max: 100, noNaN: true }), { minLength: 30, maxLength: 30 }),
        fc.array(fc.float({ min: 0, max: 100, noNaN: true }), { minLength: 0, maxLength: 10 }),
        (profile, padding) => {
          const before = scoreRadialProfile(profile, 1, [5, 10, 12]);
          const after = scoreRadialProfile([...profile, ...padding], 1, [5, 10, 12]);
          if (Number.isFinite(before)) {
            expect(after).toBeCloseTo(before, 10);
          } else {
            expect(after).toBe(before);
          }
        },
      ),
    );
  });
});

// spec table AR — applyRefinement
describe('applyRefinement', () => {
  // A canvas at 4 px/mm whose printed rings sit 6% further out than the base
  // transform assumes: ring r mm at r * 4 * 1.06 px. The search scores rings
  // at r * 4 * scale, so it settles on 1.06, and a ring must then come out at
  // r mm, not r * 1.06^2.
  const PX_PER_MM = 4;
  const TRUE_SCALE = 1.06;
  const RINGS = [25, 50, 75, 100];
  const base: RectificationTransform = {
    center: { x: 0, y: 0 },
    m: [1 / PX_PER_MM, 0, 0, 1 / PX_PER_MM],
    offset: { x: 0, y: 0 },
  };
  const profile = new Float64Array(600);
  for (const r of RINGS) profile[Math.round(r * PX_PER_MM * TRUE_SCALE)] = 1;
  const result = coarseToFineRefine((_dx, _dy, scale) =>
    scoreRadialProfile(profile, PX_PER_MM * scale, RINGS),
  );

  it('AR1: the search settles on the scale the rings were drawn at', () => {
    expect(result.scale).toBeCloseTo(TRUE_SCALE, 2);
  });

  it('AR2: a printed ring maps back to its own radius in mm', () => {
    const t = applyRefinement(base, { dxMm: 0, dyMm: 0, scale: result.scale });
    for (const r of RINGS) {
      const mm = imageToTargetMm(t, { x: r * PX_PER_MM * TRUE_SCALE, y: 0 });
      // within the search's scale resolution (0.5%), where the old
      // pass-through put it 12% out
      expect(Math.abs(mm.x - r)).toBeLessThan(0.005 * r);
    }
  });

  it('AR3: is refineRectification with the reciprocal scale, and the shift unchanged', () => {
    const r = { dxMm: 1.5, dyMm: -2, scale: 1.08 };
    const p = { x: 37, y: -12 };
    expect(imageToTargetMm(applyRefinement(base, r), p)).toEqual(
      imageToTargetMm(refineRectification(base, r.dxMm, r.dyMm, 1 / r.scale), p),
    );
    // the shift is in base mm: the refined centre is (dx, dy) of the base
    const c = imageToTargetMm(applyRefinement(base, r), { x: 1.5 * PX_PER_MM, y: -2 * PX_PER_MM });
    expect(c.x).toBeCloseTo(0, 12);
    expect(c.y).toBeCloseTo(0, 12);
  });
});
