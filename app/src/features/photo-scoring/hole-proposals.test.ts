import fixture from './hole-proposals.fixtures.json';
import {
  HOLE_PROPOSAL_BIAS,
  HOLE_PROPOSAL_FEATURE_NAMES,
  HOLE_PROPOSAL_THRESHOLD,
  HOLE_PROPOSAL_WEIGHTS,
  gaussianKernel,
  holeCandidates,
  holeProposalProbability,
  proposeHoles,
  type ProposalFace,
} from './hole-proposals';
import { syntheticCanvas } from './synthetic-canvas';
import type { RectifiedCanvas } from './tap-snap';

/**
 * Relative tolerance against the fixture, set when it came from the Python
 * spike (until ADR 0018). Everything this module computes itself was float64
 * on both sides and agreed to ~1e-9. The six
 * texture features come from `holeFeatures`, which mirrors an OpenCV float32
 * pipeline (see hole-features.test.ts), and on synthetic art with exactly
 * vertical edges a float32 rounding residue can move one edge pixel across an
 * orientation bin — measured at 2.4e-4 on `orient_entropy`. The real porting
 * bugs this fixture caught while being written were 0.7% (histogram edges)
 * and 100% (a wrong window), so the margin is generous only in name.
 */
const REL = 1e-4;
const REL_TEXTURE = 1e-3;
const TEXTURE_FEATURES = new Set(HOLE_PROPOSAL_FEATURE_NAMES.slice(0, 6));

function closeTo(actual: number, expected: number, label: string, rel = REL) {
  const tolerance = rel * Math.max(1, Math.abs(expected));
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: got ${actual}, fixture ${expected}`);
  }
}

function faceOf(): ProposalFace {
  const rings = fixture.ringsPx.map((r) => r / fixture.pxPerMm);
  return {
    caliberMm: fixture.caliberMm,
    blackRadiusMm: fixture.blackRadiusPx / fixture.pxPerMm,
    maxRadiusMm: rings[rings.length - 1] as number,
    ringRadiiMm: rings,
  };
}

function canvasOf(scenario: (typeof fixture.scenarios)[number]): RectifiedCanvas {
  const data = syntheticCanvas({
    seed: scenario.seed,
    size: scenario.size,
    holes: scenario.holes.map(([x, y]) => [x as number, y as number] as const),
    patches: scenario.patches.map(([x, y]) => [x as number, y as number] as const),
    blackR: fixture.blackRadiusPx,
    rings: fixture.ringsPx,
    pad: fixture.pad,
  });
  const c = Math.floor(scenario.size / 2);
  return { data, size: scenario.size, centerXPx: c, centerYPx: c, pxPerMm: fixture.pxPerMm };
}

it('carries the same constants as the fixture', () => {
  expect(fixture.featureNames).toEqual([...HOLE_PROPOSAL_FEATURE_NAMES]);
  for (const name of HOLE_PROPOSAL_FEATURE_NAMES) {
    expect(HOLE_PROPOSAL_WEIGHTS[name]).toBe(fixture.weights[name]);
  }
  expect(HOLE_PROPOSAL_BIAS).toBe(fixture.bias);
  expect(HOLE_PROPOSAL_THRESHOLD).toBe(fixture.threshold);
});

it('draws the synthetic canvases pixel for pixel as the fixture records', () => {
  for (const scenario of fixture.scenarios) {
    const canvas = canvasOf(scenario);
    let sum = 0;
    for (let i = 0; i < canvas.data.length; i += 1) sum += canvas.data[i] as number;
    expect(sum).toBe(scenario.checksum);
  }
});

it('builds the Gaussian kernel from the formula, normalised', () => {
  const k = gaussianKernel(1);
  expect(k.length).toBe(7);
  expect(Array.from(k).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  expect(k[3]).toBeGreaterThan(k[2] as number);
});

it('reproduces every candidate, feature and probability of the fixture', () => {
  const face = faceOf();
  for (const scenario of fixture.scenarios) {
    const canvas = canvasOf(scenario);
    const candidates = holeCandidates(canvas, face);
    expect(candidates.map((c) => [c.x, c.y])).toEqual(scenario.candidates.map((c) => [c.x, c.y]));
    scenario.candidates.forEach((expected, i) => {
      const got = candidates[i]!;
      const where = `seed ${scenario.seed} candidate ${i} at (${expected.x}, ${expected.y})`;
      closeTo(got.resp, expected.resp, `${where} resp`);
      for (const name of HOLE_PROPOSAL_FEATURE_NAMES) {
        closeTo(
          got.features[name],
          expected.features[name],
          `${where} ${name}`,
          TEXTURE_FEATURES.has(name) ? REL_TEXTURE : REL,
        );
      }
      closeTo(got.probability, expected.probability, `${where} probability`);
      closeTo(holeProposalProbability(got.features), got.probability, `${where} logistic`);
    });
  }
});

it('proposes the same holes at the same refined centres as the fixture', () => {
  const face = faceOf();
  for (const scenario of fixture.scenarios) {
    const canvas = canvasOf(scenario);
    const proposals = proposeHoles(canvas, face);
    expect(proposals.map((p) => [p.peakX, p.peakY])).toEqual(
      scenario.proposals.map((p) => [p.peakX, p.peakY]),
    );
    scenario.proposals.forEach((expected, i) => {
      const got = proposals[i]!;
      const c = Math.floor(scenario.size / 2);
      closeTo(got.xMm * fixture.pxPerMm + c, expected.x, `seed ${scenario.seed} proposal ${i} x`);
      closeTo(got.yMm * fixture.pxPerMm + c, expected.y, `seed ${scenario.seed} proposal ${i} y`);
      closeTo(got.probability, expected.probability, `seed ${scenario.seed} proposal ${i} p`);
    });
  }
});

it('finds every synthetic hole that stands alone, and merges a touching pair', () => {
  const face = faceOf();
  for (const scenario of fixture.scenarios) {
    const proposals = proposeHoles(canvasOf(scenario), face);
    const d = fixture.caliberMm * fixture.pxPerMm;
    const c = Math.floor(scenario.size / 2);
    const found = scenario.holes.map(([hx, hy]) =>
      proposals.some(
        (p) =>
          Math.hypot(p.xMm * fixture.pxPerMm + c - hx, p.yMm * fixture.pxPerMm + c - hy) < 0.5 * d,
      ),
    );
    // a hole closer than one diameter to another hole may be merged into it
    scenario.holes.forEach(([hx, hy], i) => {
      const touching = scenario.holes.some(
        ([ox, oy], j) => j !== i && Math.hypot(hx - ox, hy - oy) < d,
      );
      if (!touching) expect(found[i]).toBe(true);
    });
    // and nothing is proposed on a patch
    for (const [px, py] of scenario.patches) {
      expect(
        proposals.some(
          (p) => Math.hypot(p.xMm * fixture.pxPerMm + c - px, p.yMm * fixture.pxPerMm + c - py) < d,
        ),
      ).toBe(false);
    }
  }
});

it('refuses a canvas that cannot hold the stage', () => {
  const face = faceOf();
  expect(
    holeCandidates(
      { data: new Uint8Array(4), size: 2, centerXPx: 1, centerYPx: 1, pxPerMm: 4 },
      face,
    ),
  ).toEqual([]);
  expect(
    holeCandidates(
      { data: new Uint8Array(10), size: 8, centerXPx: 4, centerYPx: 4, pxPerMm: 4 },
      face,
    ),
  ).toEqual([]);
});
