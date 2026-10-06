import fixture from './closeup-lock.fixtures.json';
import {
  CLOSEUP_GATE,
  type CloseupLock,
  chooseLock,
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
  ringDriftMm,
  ringOffsetMm,
} from './closeup-lock';
import { applyHomography, type Homography } from './corners';
import { CLOSEUP_DRAWING, syntheticCloseup } from './synthetic-canvas';
import { invertHomography } from './transform';

/** Against the fixture, mm (task spec: centre and radii). */
const TOL_MM = 0.05;

type Scenario = (typeof fixture.scenarios)[number];

function imageOf(s: Scenario) {
  return {
    width: s.width,
    height: s.height,
    data: syntheticCloseup({
      seed: s.seed,
      width: s.width,
      height: s.height,
      H: s.H,
      holes: s.holes.map(([x, y]) => [x as number, y as number] as const),
    }),
  };
}

// The pure lock takes a second or two per 1024 px scene, so each runs once.
const results = new Map<
  string,
  {
    lock: CloseupLock | null;
    offsetOfOwn: number | null;
    work: ReturnType<typeof closeupWorkImage>;
  }
>();
beforeAll(() => {
  for (const s of fixture.scenarios) {
    const work = closeupWorkImage(imageOf(s), undefined, fixture.workLongSide);
    const lock = lockCloseupWork(work);
    results.set(s.name, { lock, offsetOfOwn: lock ? ringOffsetMm(work, lock.toMm) : null, work });
  }
}, 120_000);

function radiusMm(h: readonly number[], p: { x: number; y: number }): number {
  const q = applyHomography(h as unknown as Homography, p);
  return Math.hypot(q.x, q.y);
}

it('carries the same constants as the fixture', () => {
  expect(fixture.gate).toEqual(CLOSEUP_GATE);
  expect(fixture.blackR).toBe(CLOSEUP_DRAWING.blackR);
  expect(fixture.rings).toEqual([...CLOSEUP_DRAWING.rings]);
  expect(fixture.lineHalf).toBe(CLOSEUP_DRAWING.lineHalf);
  expect(fixture.holeR).toBe(CLOSEUP_DRAWING.holeR);
});

it('draws the synthetic close-ups pixel for pixel as the fixture records', () => {
  for (const s of fixture.scenarios) {
    let sum = 0;
    for (const v of imageOf(s).data) sum += v;
    expect(sum).toBe(s.checksum);
  }
});

it('locks every synthetic close-up where the fixture does, to the same centre and rings', () => {
  for (const s of fixture.scenarios) {
    const got = results.get(s.name)!.lock;
    const ref = s.lock;
    expect([s.name, got === null]).toEqual([s.name, ref === null]);
    if (!got || !ref) continue;
    // the lock's centre, measured by the fixture's mapping
    const centreErr = radiusMm(ref.toMm, got.center);
    if (centreErr > TOL_MM) throw new Error(`${s.name}: centre off by ${centreErr} mm`);
    // points on the fixture's 25/50/75 mm circles, measured by the lock
    const back = invertHomography(ref.toMm as unknown as Homography)!;
    for (const R of [25, 50, 75]) {
      for (let i = 0; i < 36; i += 1) {
        const a = (i * Math.PI) / 18;
        const p = applyHomography(back, { x: R * Math.cos(a), y: R * Math.sin(a) });
        if (p.x < 0 || p.y < 0 || p.x > s.width - 1 || p.y > s.height - 1) continue;
        const err = Math.abs(radiusMm(got.toMm, p) - R);
        if (err > TOL_MM)
          throw new Error(`${s.name}: ${R} mm ring off by ${err} mm at ${i * 10} deg`);
      }
    }
    expect(got.rings).toBe(ref.rings);
    expect(Math.abs(got.period - ref.period)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(got.residualMm - ref.residualMm)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(got.comb - ref.comb)).toBeLessThanOrEqual(0.01 * Math.abs(ref.comb));
    expect(got.ringOffsetMm).not.toBeNull();
    expect(Math.abs(got.ringOffsetMm! - ref.ringOffsetMm!)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect([s.name, got.faceContrast === null]).toEqual([s.name, ref.faceContrast === null]);
    if (got.faceContrast !== null && ref.faceContrast !== null)
      expect(Math.abs(got.faceContrast - ref.faceContrast)).toBeLessThanOrEqual(0.01);
  }
});

it('reaches the same gate verdict as the fixture', () => {
  for (const s of fixture.scenarios) {
    expect([s.name, passesCloseupGate(results.get(s.name)!.lock)]).toEqual([s.name, s.passes]);
  }
});

it('refuses a close-up whose centre is out of frame', () => {
  const outer = fixture.scenarios.find((s) => s.name === 'outer')!;
  const { lock } = results.get('outer')!;
  expect(outer.passes).toBe(false);
  expect(passesCloseupGate(lock)).toBe(false);
});

it('measures a lock with the same yardstick its gate used', () => {
  for (const s of fixture.scenarios) {
    const { lock, offsetOfOwn } = results.get(s.name)!;
    if (lock) expect([s.name, offsetOfOwn]).toEqual([s.name, lock.ringOffsetMm]);
  }
});

describe('ringDriftMm', () => {
  const scaled = (h: Homography, k: number): Homography =>
    h.map((v, i) => (i < 6 ? v * k : v)) as unknown as Homography;

  it('reads a lock on the lines as on the lines', () => {
    const { lock, work } = results.get('centred')!;
    expect(ringDriftMm(work, lock!.toMm)).toBeLessThanOrEqual(0.5);
  });

  it('reads a lock at the wrong scale as far off, past what the ±3 mm yardstick can say', () => {
    const { lock, work } = results.get('centred')!;
    for (const k of [0.88, 1.15]) {
      expect(ringDriftMm(work, scaled(lock!.toMm, k))).toBeGreaterThan(4.5);
      expect(ringOffsetMm(work, scaled(lock!.toMm, k))).toBeLessThanOrEqual(3);
    }
  });
});

describe('chooseLock', () => {
  const lock = (ringOffsetMm: number | null): CloseupLock => ({
    toMm: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    center: { x: 0, y: 0 },
    residualMm: 0.1,
    comb: 20,
    ringOffsetMm,
    rings: 3,
    support: 1,
    axisRatio: 1,
    faceContrast: null,
    voteCenter: { x: 0, y: 0 },
    period: 100,
  });

  it('keeps the disc lock when only it passes', () => {
    expect(chooseLock({ discPasses: true, discOffsetMm: 0.3, closeup: null })).toBe('disc');
    expect(chooseLock({ discPasses: true, discOffsetMm: 0.3, closeup: lock(0.8) })).toBe('disc');
  });

  it('takes the close-up when only it passes', () => {
    expect(chooseLock({ discPasses: false, discOffsetMm: null, closeup: lock(0.2) })).toBe(
      'closeup',
    );
  });

  it('keeps whichever sits closer to the printed lines when both pass', () => {
    expect(chooseLock({ discPasses: true, discOffsetMm: 0.7, closeup: lock(0.1) })).toBe('closeup');
    expect(chooseLock({ discPasses: true, discOffsetMm: 0.1, closeup: lock(0.3) })).toBe('disc');
    expect(chooseLock({ discPasses: true, discOffsetMm: 0.2, closeup: lock(0.2) })).toBe('disc');
    expect(chooseLock({ discPasses: true, discOffsetMm: null, closeup: lock(0.2) })).toBe(
      'closeup',
    );
  });

  it('refuses a close-up at a whole-number fraction of the disc lock’s scale', () => {
    // 1 mm per px for the disc; a close-up at 0.5 mm per px read every second
    // printed line as one step.
    const disc: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const at = (s: number) => ({ ...lock(0.1), toMm: [s, 0, 0, 0, s, 0, 0, 0, 1] as Homography });
    for (const s of [1 / 2, 1 / 3, 1 / 4, 0.52, 0.32]) {
      expect([
        s,
        chooseLock({ discPasses: true, discOffsetMm: 0.7, closeup: at(s), discToMm: disc }),
      ]).toEqual([s, 'disc']);
    }
    // A disc lock that is merely a little off is not vetoed: the closer
    // rings still win.
    for (const s of [1, 0.88, 0.63, 0.41]) {
      expect([
        s,
        chooseLock({ discPasses: true, discOffsetMm: 0.7, closeup: at(s), discToMm: disc }),
      ]).toEqual([s, 'closeup']);
    }
  });

  it('falls through to the corners when neither passes', () => {
    expect(chooseLock({ discPasses: false, discOffsetMm: 0.1, closeup: lock(0.9) })).toBeNull();
    expect(chooseLock({ discPasses: false, discOffsetMm: null, closeup: null })).toBeNull();
  });
});
