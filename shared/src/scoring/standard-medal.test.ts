// Executable spec: docs/specs/m5-stats-spec.md — behaviors B1-B12.
import { describe, expect, it } from 'vitest';

import { standardMedalForSession, standardMedalPoints } from './standard-medal';

describe('standardMedalPoints', () => {
  it('B1: exact silver hit at a tabulated series count', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        seriesCount: 7,
        totalPoints: 330,
      }),
    ).toEqual({ grade: 'silver', silverThreshold: 330, bronsThreshold: 322 });
  });

  it('B2: brons band', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:A',
        seriesCount: 6,
        totalPoints: 270,
      }),
    ).toEqual({ grade: 'brons', silverThreshold: 277, bronsThreshold: 267 });
  });

  it('B3: below brons', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:B',
        seriesCount: 10,
        totalPoints: 300,
      }),
    ).toEqual({ grade: null, silverThreshold: 470, bronsThreshold: 455 });
  });

  it('brons threshold is inclusive (>=), not exclusive', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:B',
        seriesCount: 10,
        totalPoints: 455, // exactly the brons threshold
      }),
    ).toEqual({ grade: 'brons', silverThreshold: 470, bronsThreshold: 455 });
  });

  it('an unmapped weapon group at seriesCount>10 never reaches the scaling formula', () => {
    // Regression guard: the `!group` early-return at line 101 must fire
    // before scalePrecisionThresholds would index the table with an
    // undefined group (which throws).
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:R',
        seriesCount: 11,
        totalPoints: 500,
      }),
    ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
  });

  it('B4: >10 series scaling, silver', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        seriesCount: 11,
        totalPoints: 520,
      }),
    ).toEqual({ grade: 'silver', silverThreshold: 518, bronsThreshold: 506 });
  });

  it('B5: >10 series scaling, brons', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        seriesCount: 11,
        totalPoints: 510,
      }),
    ).toEqual({ grade: 'brons', silverThreshold: 518, bronsThreshold: 506 });
  });

  it('B6: series count with no defined row', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        seriesCount: 8,
        totalPoints: 400,
      }),
    ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
  });

  it('B7: milsnabb fixed 12-series table, silver', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-milsnabb',
        weaponGroup: 'spsf:R',
        seriesCount: 12,
        totalPoints: 555,
      }),
    ).toEqual({ grade: 'silver', silverThreshold: 552, bronsThreshold: 528 });
  });

  it('B8: milsnabb wrong series count has no row', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-milsnabb',
        weaponGroup: 'spsf:R',
        seriesCount: 6,
        totalPoints: 555,
      }),
    ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
  });

  it('B9: unmapped weapon group (R in precision) and null/undefined group', () => {
    const expected = { grade: null, silverThreshold: null, bronsThreshold: null };
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:R',
        seriesCount: 7,
        totalPoints: 330,
      }),
    ).toEqual(expected);
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        weaponGroup: null,
        seriesCount: 7,
        totalPoints: 330,
      }),
    ).toEqual(expected);
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-precision',
        seriesCount: 7,
        totalPoints: 330,
      }),
    ).toEqual(expected);
  });

  it('B10: non-medal discipline', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'generic-rings',
        weaponGroup: 'spsf:C',
        seriesCount: 7,
        totalPoints: 330,
      }),
    ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
  });

  it('a non-medal discipline never falls through into the milsnabb table', () => {
    // Regression guard for the discipline dispatch: an unrecognized
    // disciplineId that happens to share a milsnabb-shaped input (12
    // series, a valid milsnabb weapon-group id) must still resolve to no
    // thresholds, proving the milsnabb branch is gated on disciplineId.
    expect(
      standardMedalPoints({
        disciplineId: 'not-a-real-discipline',
        weaponGroup: 'spsf:R',
        seriesCount: 12,
        totalPoints: 555,
      }),
    ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
  });

  it('milsnabb with weaponGroup omitted has no row', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-milsnabb',
        seriesCount: 12,
        totalPoints: 555,
      }),
    ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
  });

  // Milsnabb group with no row in the fixed table, e.g. an unmapped id.
  it('milsnabb unmapped weapon group', () => {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-milsnabb',
        weaponGroup: 'spsf:M1',
        seriesCount: 12,
        totalPoints: 600,
      }),
    ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
  });
});

describe('standardMedalForSession', () => {
  it('B11: no final — evaluates the (only) total', () => {
    expect(
      standardMedalForSession({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        hasFinal: false,
        beforeFinalSeriesCount: 7,
        beforeFinalTenths: 3300,
        totalSeriesCount: 7,
        totalTenths: 3300,
      }),
    ).toEqual({ grade: 'silver', silverThreshold: 330, bronsThreshold: 322 });
  });

  it('converts tenths to points by dividing, not multiplying', () => {
    // 2000 tenths = 200 points, well below the group C 7-series brons
    // threshold (322) — proves tenths/10 is used, not tenths*10 (which
    // would push 20000 "points" into the silver band).
    expect(
      standardMedalForSession({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        hasFinal: false,
        beforeFinalSeriesCount: 7,
        beforeFinalTenths: 2000,
        totalSeriesCount: 7,
        totalTenths: 2000,
      }),
    ).toEqual({ grade: null, silverThreshold: 330, bronsThreshold: 322 });
  });

  it('B12: with a final — evaluates beforeFinal, not the after-final total', () => {
    expect(
      standardMedalForSession({
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        hasFinal: true,
        beforeFinalSeriesCount: 7,
        beforeFinalTenths: 3300,
        totalSeriesCount: 10,
        totalTenths: 4800,
      }),
    ).toEqual({ grade: 'silver', silverThreshold: 330, bronsThreshold: 322 });
  });
});
