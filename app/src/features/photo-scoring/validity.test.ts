import type { GeometryMetrics } from './validity';
import { GEOMETRY_THRESHOLDS, checkGeometryValidity } from './validity';

/** A comfortably-good precision-face photo (20250706_074951 from the corpus). */
const good: GeometryMetrics = {
  axisRatio: 1.006,
  zoneFraction: 0.349,
  centerInFrame: true,
  zoneContrastGray: 156.1,
  profileScore: 232.25,
  ringDriftMm: 0.8,
};

const withMetric = (patch: Partial<GeometryMetrics>): GeometryMetrics => ({ ...good, ...patch });

describe('checkGeometryValidity', () => {
  it('V1: accepts a photo with every metric inside its threshold', () => {
    expect(checkGeometryValidity(good)).toEqual({ valid: true, reasons: [] });
  });

  it('V2: rejects an over-elliptical black zone', () => {
    const result = checkGeometryValidity(withMetric({ axisRatio: 2.01 }));
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('axisRatio');
  });

  it('V3: enforces both ends of the zone-fraction band', () => {
    expect(checkGeometryValidity(withMetric({ zoneFraction: 0.09 })).reasons).toContain(
      'zoneFraction',
    );
    expect(checkGeometryValidity(withMetric({ zoneFraction: 0.96 })).reasons).toContain(
      'zoneFraction',
    );
  });

  it('V4: rejects a fit whose center landed outside the frame', () => {
    expect(checkGeometryValidity(withMetric({ centerInFrame: false })).reasons).toContain(
      'centerInFrame',
    );
  });

  it('V5: rejects a black zone with no contrast step against the card', () => {
    expect(checkGeometryValidity(withMetric({ zoneContrastGray: 49.9 })).reasons).toContain(
      'zoneContrast',
    );
  });

  it('V6: rejects a flat radial profile', () => {
    expect(checkGeometryValidity(withMetric({ profileScore: 19.9 })).reasons).toContain(
      'profileScore',
    );
  });

  it('V7: reports every failing metric, not just the first', () => {
    const result = checkGeometryValidity({
      axisRatio: 9,
      zoneFraction: 0.005,
      centerInFrame: false,
      zoneContrastGray: -100,
      profileScore: 1,
      ringDriftMm: 12,
    });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual([
      'axisRatio',
      'zoneFraction',
      'centerInFrame',
      'zoneContrast',
      'profileScore',
      'ringDrift',
    ]);
  });

  it('V8: thresholds are inclusive bounds', () => {
    const t = GEOMETRY_THRESHOLDS;
    expect(
      checkGeometryValidity({
        axisRatio: t.maxAxisRatio,
        zoneFraction: t.minZoneFraction,
        centerInFrame: true,
        zoneContrastGray: t.minZoneContrastGray,
        profileScore: t.minProfileScore,
        ringDriftMm: t.maxRingDriftMm,
      }).valid,
    ).toBe(true);
    expect(checkGeometryValidity(withMetric({ zoneFraction: t.maxZoneFraction })).valid).toBe(true);
  });

  it('V9: a NaN metric is invalid, never valid-by-comparison', () => {
    expect(checkGeometryValidity(withMetric({ axisRatio: Number.NaN })).reasons).toContain(
      'axisRatio',
    );
    expect(checkGeometryValidity(withMetric({ zoneFraction: Number.NaN })).reasons).toContain(
      'zoneFraction',
    );
    expect(checkGeometryValidity(withMetric({ zoneContrastGray: Number.NaN })).reasons).toContain(
      'zoneContrast',
    );
    expect(checkGeometryValidity(withMetric({ profileScore: Number.NaN })).reasons).toContain(
      'profileScore',
    );
    expect(checkGeometryValidity(withMetric({ ringDriftMm: Number.NaN })).reasons).toContain(
      'ringDrift',
    );
  });

  it('V10: rejects a fit whose rings drift off the printed lines', () => {
    expect(checkGeometryValidity(withMetric({ ringDriftMm: 4.6 })).reasons).toEqual(['ringDrift']);
  });

  it('V11: passes a fit with no ring in frame to hold it to', () => {
    expect(checkGeometryValidity(withMetric({ ringDriftMm: null })).valid).toBe(true);
  });
});

// The gate exists to reject exactly these, so they are asserted with the real
// numbers the gate's calibration measured, not with invented ones. That
// calibration predates the ring offset, hence null.
describe('the corpus photos the gate exists for', () => {
  it('rejects 20250906_104730, which locked onto a treeline and gravel', () => {
    const result = checkGeometryValidity({
      axisRatio: 2.349,
      zoneFraction: 0.005,
      centerInFrame: true,
      zoneContrastGray: -111.5,
      profileScore: 7.05,
      ringDriftMm: null,
    });
    expect(result.valid).toBe(false);
    // it fails on all four measured axes, not marginally on one
    expect(result.reasons).toEqual(['axisRatio', 'zoneFraction', 'zoneContrast', 'profileScore']);
  });

  it('rejects 20250906_150442, which locked onto a gravel bank', () => {
    const result = checkGeometryValidity({
      axisRatio: 6.389,
      zoneFraction: 0.049,
      centerInFrame: true,
      zoneContrastGray: -5.6,
      profileScore: 9.21,
      ringDriftMm: null,
    });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(['axisRatio', 'zoneFraction', 'zoneContrast', 'profileScore']);
  });

  it('rejects 20260726_153751, a milsnabb face, despite a high profile score', () => {
    // profile 121.99 would sail through a residual-only check — this is the
    // spike's point that the objective is not a validity signal.
    const result = checkGeometryValidity({
      axisRatio: 1.477,
      zoneFraction: 0.897,
      centerInFrame: true,
      zoneContrastGray: -57.7,
      profileScore: 121.99,
      ringDriftMm: null,
    });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(['zoneContrast']);
  });

  it('rejects 20260401_171339, whose profile score is 320 on a black zone filling the frame', () => {
    const result = checkGeometryValidity({
      axisRatio: 1.964,
      zoneFraction: 1.015,
      centerInFrame: true,
      zoneContrastGray: -21.0,
      profileScore: 320.45,
      ringDriftMm: null,
    });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(['zoneFraction', 'zoneContrast']);
  });

  it('accepts 20260723_191611, the weakest photo the corpus locks', () => {
    expect(
      checkGeometryValidity({
        axisRatio: 1.284,
        zoneFraction: 0.703,
        centerInFrame: true,
        zoneContrastGray: 84.2,
        profileScore: 33.84,
        ringDriftMm: null,
      }).valid,
    ).toBe(true);
  });
});
