// Executable spec: docs/specs/sighters-in-statistics-spec.md — behaviors
// SS-1..SS-20 and the two properties. Kept in its own file rather than split
// across stats.test.ts and analytics.test.ts because the contract is one
// scope argument threaded through both modules, and the pairs of
// default-scope / cross-session-scope assertions only read as a contract
// side by side.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  analyticsRecords,
  analyticsSessionPoints,
  analyticsTotals,
  type AnalyticsSeries,
} from './analytics';
import { guldserieCount, scoredSeries, scoredShots, volumeShotCount } from './stats';

const CROSS_SESSION = { includeSighters: true } as const;

let seq = 0;

function series(overrides: Partial<AnalyticsSeries> = {}): AnalyticsSeries {
  seq += 1;
  return {
    id: `s${seq}`,
    sessionId: 'session-1',
    startedAt: '2026-05-01T10:00:00.000Z',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    isSighter: false,
    isFinal: false,
    sessionType: 'training',
    tagIds: [],
    shots: [],
    ...overrides,
  };
}

/** Five shots of the same value; `innerTens` of them flagged. */
function shots(valueTenths: number, innerTens = 0) {
  return Array.from({ length: 5 }, (_unused, index) => ({
    valueTenths,
    isInnerTen: index < innerTens,
  }));
}

/** The §3 fixture: sighter A at 10.0 with two (X), scoring series B at 9.0. */
function fixture(): [AnalyticsSeries, AnalyticsSeries] {
  return [
    series({ id: 'A', isSighter: true, shots: shots(100, 2) }),
    series({ id: 'B', shots: shots(90) }),
  ];
}

describe('stats.ts — SighterScope', () => {
  it('SS-1: scoredSeries defaults to the in-session scope', () => {
    expect(scoredSeries(fixture()).map((s) => s.id)).toEqual(['B']);
  });

  it('SS-2: an explicit includeSighters:false is the same as omitting it', () => {
    expect(scoredSeries(fixture(), { includeSighters: false }).map((s) => s.id)).toEqual(['B']);
  });

  it('SS-3: includeSighters:true keeps every series, in input order', () => {
    expect(scoredSeries(fixture(), CROSS_SESSION).map((s) => s.id)).toEqual(['A', 'B']);
  });

  it('SS-4: an empty list stays empty in the cross-session scope', () => {
    expect(scoredSeries([], CROSS_SESSION)).toEqual([]);
  });

  it('SS-5: scoredShots pools the sighter shots in the cross-session scope', () => {
    const pooled = scoredShots(fixture(), CROSS_SESSION);
    expect(pooled.map((s) => s.valueTenths)).toEqual([100, 100, 100, 100, 100, 90, 90, 90, 90, 90]);
  });

  it('SS-6: scoredShots defaults to the non-sighter shots', () => {
    expect(scoredShots(fixture()).map((s) => s.valueTenths)).toEqual([90, 90, 90, 90, 90]);
  });

  it('SS-7: volumeShotCount has no scope argument — it always counts sighters', () => {
    expect(volumeShotCount(fixture())).toBe(10);
  });

  it('SS-8: guldserieCount never counts a sighter, in either scope', () => {
    const qualifying = shots(100);
    const list = [
      series({ isSighter: true, shots: qualifying }),
      series({ shots: qualifying }),
      series({ shots: shots(80) }),
    ];
    expect(guldserieCount(list, { birthYear: null })).toBe(1);
  });

  it('SS-9: the cross-session scope returns a copy, not the caller’s array', () => {
    const input = fixture();
    scoredSeries(input, CROSS_SESSION).pop();
    expect(input).toHaveLength(2);
  });
});

describe('analytics.ts — SighterScope', () => {
  it('SS-10: analyticsSessionPoints without a scope is unchanged', () => {
    expect(analyticsSessionPoints(fixture())[0]).toMatchObject({
      scoredSeriesCount: 1,
      scoredShotCount: 5,
      sessionTotalTenths: 450,
      meanSeriesTotalTenths: 450,
      meanShotTenths: 90,
      innerTenCount: 0,
      tenCount: 0,
    });
  });

  it('SS-11: analyticsSessionPoints in the cross-session scope counts the sighter', () => {
    expect(analyticsSessionPoints(fixture(), CROSS_SESSION)[0]).toMatchObject({
      scoredSeriesCount: 2,
      scoredShotCount: 10,
      sessionTotalTenths: 950,
      meanSeriesTotalTenths: 475,
      meanShotTenths: 95,
      innerTenCount: 2,
      tenCount: 5,
    });
  });

  it('SS-12: a sighter-only session yields a real point in the cross-session scope', () => {
    const [sighter] = fixture();
    expect(analyticsSessionPoints([sighter], CROSS_SESSION)[0]).toMatchObject({
      scoredSeriesCount: 1,
      meanShotTenths: 100,
    });
  });

  it('SS-13: a sighter-only session still yields an empty point by default', () => {
    const [sighter] = fixture();
    expect(analyticsSessionPoints([sighter])[0]).toMatchObject({
      scoredSeriesCount: 0,
      scoredShotCount: 0,
      meanSeriesTotalTenths: null,
      meanShotTenths: null,
    });
  });

  it('SS-14: analyticsTotals without a scope is unchanged', () => {
    expect(analyticsTotals(fixture())).toMatchObject({
      scoredSeriesCount: 1,
      scoredShotCount: 5,
      sumTenths: 450,
      meanShotTenths: 90,
      meanSeriesTenths: 450,
      innerTenCount: 0,
      tenCount: 0,
    });
  });

  it('SS-15: analyticsTotals in the cross-session scope counts the sighter', () => {
    expect(analyticsTotals(fixture(), CROSS_SESSION)).toMatchObject({
      scoredSeriesCount: 2,
      scoredShotCount: 10,
      sumTenths: 950,
      meanShotTenths: 95,
      meanSeriesTenths: 475,
      innerTenCount: 2,
      tenCount: 5,
    });
  });

  it('SS-16: volume and session count are identical in both scopes', () => {
    const list = fixture();
    const byDefault = analyticsTotals(list);
    const crossSession = analyticsTotals(list, CROSS_SESSION);

    expect(byDefault.volumeShotCount).toBe(10);
    expect(crossSession.volumeShotCount).toBe(10);
    expect(byDefault.sessionCount).toBe(1);
    expect(crossSession.sessionCount).toBe(1);
  });

  it('SS-17: an empty sighter series carries no score and is counted in neither scope', () => {
    const list = [series({ isSighter: true, shots: [] }), series({ shots: shots(90) })];
    expect(analyticsTotals(list, CROSS_SESSION)).toMatchObject({
      scoredSeriesCount: 1,
      sumTenths: 450,
      meanSeriesTenths: 450,
    });
  });

  it('SS-18: a WS1 override sighter contributes its stored total, not shot figures', () => {
    const list = [
      series({
        isSighter: true,
        shots: [],
        totalOverride: { tenths: 480, shotCount: 5 },
      }),
      series({ shots: shots(90) }),
    ];
    expect(analyticsTotals(list, CROSS_SESSION)).toMatchObject({
      scoredSeriesCount: 2,
      sumTenths: 930,
      meanSeriesTenths: 465,
      scoredShotCount: 5,
      meanShotTenths: 90,
      volumeShotCount: 10,
    });
  });

  it('SS-19: records follow the cross-session scope', () => {
    const records = analyticsRecords(analyticsSessionPoints(fixture(), CROSS_SESSION));
    expect(records.bestSessionTotalTenths?.value).toBe(950);
    expect(records.mostInnerTens?.value).toBe(2);
    expect(records.mostTens?.value).toBe(5);
  });

  it('SS-20: records are unchanged in the default scope', () => {
    const records = analyticsRecords(analyticsSessionPoints(fixture()));
    expect(records.bestSessionTotalTenths?.value).toBe(450);
    expect(records.mostInnerTens?.value).toBe(0);
    expect(records.mostTens?.value).toBe(0);
  });
});

describe('analytics.ts — SighterScope properties', () => {
  const arbSeries = fc.record({
    sessionId: fc.constantFrom('a', 'b'),
    isSighter: fc.boolean(),
    values: fc.array(fc.integer({ min: 0, max: 109 }), { maxLength: 6 }),
    innerTens: fc.nat({ max: 6 }),
  });

  const build = (raw: {
    sessionId: string;
    isSighter: boolean;
    values: number[];
    innerTens: number;
  }): AnalyticsSeries =>
    series({
      sessionId: raw.sessionId,
      isSighter: raw.isSighter,
      shots: raw.values.map((valueTenths, index) => ({
        valueTenths,
        isInnerTen: index < raw.innerTens,
      })),
    });

  it('SS-P1: "included" equals "as if never marked sighter"', () => {
    fc.assert(
      fc.property(fc.array(arbSeries, { maxLength: 8 }), (raws) => {
        const list = raws.map(build);
        const unflagged = list.map((s) => ({ ...s, isSighter: false }));
        expect(analyticsTotals(list, CROSS_SESSION)).toEqual(analyticsTotals(unflagged));
      }),
    );
  });

  it('SS-P2: the default scope never counts more shots, and volume is scope-free', () => {
    fc.assert(
      fc.property(fc.array(arbSeries, { maxLength: 8 }), (raws) => {
        const list = raws.map(build);
        const byDefault = analyticsTotals(list);
        const crossSession = analyticsTotals(list, CROSS_SESSION);

        expect(byDefault.scoredShotCount).toBeLessThanOrEqual(crossSession.scoredShotCount);
        expect(byDefault.volumeShotCount).toBe(crossSession.volumeShotCount);
      }),
    );
  });
});
