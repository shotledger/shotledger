// Executable spec: docs/specs/m5-stats-spec.md — behaviors B1-B12.
import { describe, expect, it } from 'vitest';

import {
  placementOnlyStandardMedal,
  standardMedalForSession,
  standardMedalPoints,
} from './standard-medal';

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

// Expected values are docs/reference/spsf-shb-2026.md §"Standardmedalj",
// transcribing SHB 2026 C.5.1.2.3 p. 71 (precision) and C.5.1.2.5 p. 71
// (militär snabbmatch). Each row checks both bands at and one below the line.
describe('standardMedalPoints — the full threshold tables', () => {
  const bands = (
    disciplineId: string,
    weaponGroup: string,
    seriesCount: number,
    silver: number,
    brons: number,
  ) => {
    const at = (totalPoints: number) =>
      standardMedalPoints({ disciplineId, weaponGroup, seriesCount, totalPoints });
    const thresholds = { silverThreshold: silver, bronsThreshold: brons };
    expect(at(silver)).toEqual({ grade: 'silver', ...thresholds });
    expect(at(silver - 1)).toEqual({ grade: 'brons', ...thresholds });
    expect(at(brons)).toEqual({ grade: 'brons', ...thresholds });
    expect(at(brons - 1)).toEqual({ grade: null, ...thresholds });
  };

  const precision: [number, string, number, number][] = [
    [6, 'A', 277, 267],
    [6, 'B', 282, 273],
    [6, 'C', 283, 276],
    [7, 'A', 323, 312],
    [7, 'B', 329, 319],
    [7, 'C', 330, 322],
    [10, 'A', 461, 445],
    [10, 'B', 470, 455],
    [10, 'C', 471, 460],
  ];

  it.each(precision)(
    'precision, %i series, group %s: silver %i, brons %i (C.5.1.2.3)',
    (seriesCount, group, silver, brons) => {
      bands('spsf-precision', `spsf:${group}`, seriesCount, silver, brons);
    },
  );

  const milsnabb: [string, number, number][] = [
    ['A', 540, 516],
    ['R', 552, 528],
    ['B', 561, 537],
    ['C', 564, 540],
  ];

  it.each(milsnabb)(
    'milsnabb, 12 series, group %s: silver %i, brons %i (C.5.1.2.5)',
    (group, silver, brons) => {
      bands('spsf-milsnabb', `spsf:${group}`, 12, silver, brons);
    },
  );

  // A-opt shares A's column in C.5.1.2.3; AM, AP and AG are sub-groups of A
  // (F.4 pp. 169-172).
  it.each(['spsf:A', 'spsf:AM', 'spsf:AP', 'spsf:AG', 'spsf:A-opt'])(
    'precision %s is judged on the A row',
    (weaponGroup) => {
      for (const [seriesCount, , silver, brons] of precision.filter(([, g]) => g === 'A')) {
        bands('spsf-precision', weaponGroup, seriesCount, silver, brons);
      }
    },
  );

  // Above 10 series: the 10-series value / 10 x series count (C.5.1.2.3),
  // rounded to the nearest point (m5-stats-spec "Domain facts" item 4). These
  // counts land on .5, .7 and .3, where nearest, floor and ceiling disagree.
  const scaled: [number, string, number, number][] = [
    [15, 'A', 692, 668], // 691.5, 667.5
    [17, 'A', 784, 757], // 783.7, 756.5
    [13, 'C', 612, 598], // 612.3, 598
  ];

  it.each(scaled)(
    'precision, %i series, group %s scales to silver %i, brons %i',
    (seriesCount, group, silver, brons) => {
      bands('spsf-precision', `spsf:${group}`, seriesCount, silver, brons);
    },
  );
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

  it('N2 (#315): fält never earns a computed standardmedalj, at any score', () => {
    // Placement only in fält — best 1/9 silver, best 1/3 brons (C.5.1.2 /
    // C.5.1.2.1 p. 70). The fixed-points table is precision's alone, so the
    // app records a fält medal and never derives one.
    // Scores and counts chosen to clear precision's and milsnabb's own
    // thresholds: if fält ever fell through to either table, these would
    // come back silver.
    for (const [seriesCount, totalPoints] of [
      [8, 48],
      [10, 471],
      [12, 564],
      [20, 950],
    ]) {
      expect(
        standardMedalPoints({
          disciplineId: 'spsf-falt',
          weaponGroup: 'spsf:C',
          seriesCount: seriesCount!,
          totalPoints: totalPoints!,
        }),
      ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
    }
  });
});

// Magnumprecision — executable spec: docs/specs/magnumprecision-spec.md,
// scenarios MP9-MP16. Thresholds: SHB 2026 C.5.1.2.4 p. 71, which prints one
// unlabelled pair per vapengrupp; C.5.1 p. 69 fixes the tävlingsomfattning at
// six 5-shot series, so that is the only series count they are stated for.
describe('standardMedalPoints — magnumprecision (SHB C.5.1.2.4 p. 71)', () => {
  const magnum = (weaponGroup: string, totalPoints: number, seriesCount = 6) =>
    standardMedalPoints({
      disciplineId: 'spsf-magnumprecision',
      weaponGroup,
      seriesCount,
      totalPoints,
    });

  const NONE = { grade: null, silverThreshold: null, bronsThreshold: null };

  it('MP9: M1-M4 and M8 — silver 282, brons 274', () => {
    for (const group of ['spsf:M1', 'spsf:M2', 'spsf:M3', 'spsf:M4', 'spsf:M8']) {
      expect(magnum(group, 282)).toEqual({
        grade: 'silver',
        silverThreshold: 282,
        bronsThreshold: 274,
      });
      expect(magnum(group, 281).grade).toBe('brons');
      expect(magnum(group, 274).grade).toBe('brons');
      expect(magnum(group, 273).grade).toBeNull();
    }
  });

  it('MP10: M5 (frigrupp) — silver 294, brons 288', () => {
    expect(magnum('spsf:M5', 294)).toEqual({
      grade: 'silver',
      silverThreshold: 294,
      bronsThreshold: 288,
    });
    expect(magnum('spsf:M5', 293).grade).toBe('brons');
    expect(magnum('spsf:M5', 288).grade).toBe('brons');
    expect(magnum('spsf:M5', 287).grade).toBeNull();
  });

  it('MP11: M6, M7 and M9 — silver 270, brons 253', () => {
    for (const group of ['spsf:M6', 'spsf:M7', 'spsf:M9']) {
      expect(magnum(group, 270)).toEqual({
        grade: 'silver',
        silverThreshold: 270,
        bronsThreshold: 253,
      });
      expect(magnum(group, 269).grade).toBe('brons');
      expect(magnum(group, 253).grade).toBe('brons');
      expect(magnum(group, 252).grade).toBeNull();
    }
  });

  it('MP12: any series count but six yields no threshold at all', () => {
    // SHB states the fixed pairs for the six-series omfattning only and gives
    // magnumprecision no scaling rule (unlike precision's C.5.1.2.3). Nothing
    // is extrapolated — see the spec's VERIFY on this.
    for (const seriesCount of [1, 5, 7, 10, 12]) {
      expect(magnum('spsf:M1', 400, seriesCount)).toEqual(NONE);
    }
  });

  it('MP13: a non-magnum weapon group on magnumprecision yields nothing', () => {
    expect(magnum('spsf:C', 300)).toEqual(NONE);
    expect(magnum('spsf:A', 300)).toEqual(NONE);
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-magnumprecision',
        seriesCount: 6,
        totalPoints: 300,
      }),
    ).toEqual(NONE);
  });

  it('MP14: the magnum table never leaks into another discipline', () => {
    // 'generic-rings' and the unknown id fall past every branch, so they also
    // pin that the magnum branch is reached by its discipline check and not
    // by being last — a mutation survivor before this line existed.
    for (const disciplineId of [
      'spsf-precision',
      'spsf-milsnabb',
      'generic-rings',
      'issf-air-pistol',
    ]) {
      expect(
        standardMedalPoints({
          disciplineId,
          weaponGroup: 'spsf:M5',
          seriesCount: 6,
          totalPoints: 300,
        }),
      ).toEqual(NONE);
    }
  });

  it('MP15: standardMedalForSession routes magnumprecision through the total', () => {
    expect(
      standardMedalForSession({
        disciplineId: 'spsf-magnumprecision',
        weaponGroup: 'spsf:M5',
        hasFinal: false,
        beforeFinalSeriesCount: 6,
        beforeFinalTenths: 2940,
        totalSeriesCount: 6,
        totalTenths: 2940,
      }),
    ).toEqual({ grade: 'silver', silverThreshold: 294, bronsThreshold: 288 });
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in docs/reqstool/README.md.
 *
 * @SVCs SVC_SCORE_002
 */
it('judges the standardmedalj on the grundomgång, never on the after-final total', () => {
  // 7 scored series in vapengrupp C: silver 330, brons 322 (C.5.1.2.3).
  const base = {
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    beforeFinalSeriesCount: 7,
    beforeFinalTenths: 3230,
    totalSeriesCount: 7,
    totalTenths: 3230,
  };
  expect(standardMedalForSession({ ...base, hasFinal: false }).grade).toBe('brons');
  // A final adds points the medal must not see: the grundomgång is still 323.0.
  expect(
    standardMedalForSession({ ...base, hasFinal: true, totalSeriesCount: 8, totalTenths: 3330 })
      .grade,
  ).toBe('brons');
});

describe('Nationell helmatch: placement only (SHB C.5.1.1.7, C.5.1.2)', () => {
  it('M1: helmatch is placement-only; the disciplines with a points path are not', () => {
    expect(placementOnlyStandardMedal('spsf-helmatch')).toBe(true);
    for (const id of [
      'spsf-precision',
      'spsf-milsnabb',
      'spsf-magnumprecision',
      'spsf-figurskjutning',
      'generic-rings',
    ]) {
      expect(placementOnlyStandardMedal(id)).toBe(false);
    }
  });

  it('M2: no helmatch total computes a medal', () => {
    for (const weaponGroup of ['spsf:A', 'spsf:B', 'spsf:C']) {
      expect(
        standardMedalPoints({
          disciplineId: 'spsf-helmatch',
          weaponGroup,
          seriesCount: 12,
          totalPoints: 600,
        }),
      ).toEqual({ grade: null, silverThreshold: null, bronsThreshold: null });
    }
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in docs/reqstool/README.md.
 *
 * @SVCs SVC_SCORE_009
 */
it('treats helmatch as placement-only and computes no medal from any helmatch total', () => {
  expect(placementOnlyStandardMedal('spsf-helmatch')).toBe(true);
  expect(placementOnlyStandardMedal('spsf-precision')).toBe(false);
  for (const totalPoints of [0, 540, 600]) {
    expect(
      standardMedalPoints({
        disciplineId: 'spsf-helmatch',
        weaponGroup: 'spsf:C',
        seriesCount: 12,
        totalPoints,
      }).grade,
    ).toBeNull();
  }
});
