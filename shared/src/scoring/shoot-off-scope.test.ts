// Executable spec: docs/specs/shoot-off-and-ten-counts-727-spec.md — S2/S3
// across the statistics modules. A shoot-off (särskjutning) series decides
// placement only, so every score statistic leaves it out in every scope,
// while volume still counts its shots. Kept beside sighter-scope.test.ts,
// whose fixture shape it follows: the contract is one rule threaded through
// several modules, and it reads best side by side.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { previousSessionOf, scoredOrdinal, seriesAtOrdinal } from '../session-entry/last-time';
import {
  analyticsRecords,
  analyticsSessionPoints,
  analyticsTotals,
  type AnalyticsSeries,
} from './analytics';
import { sighterRelation } from './sighter-relation';
import { stageSubtotals, tieBreakTenths } from './stages';
import { goldSeriesCount, scoredSeries, scoredShots, volumeShotCount } from './stats';
import { compareWithUsualForm } from './usual-form';

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

/** A scoring series B at 9.0 and a shoot-off C at 10.0 with five (X). */
function fixture(): AnalyticsSeries[] {
  return [
    series({ id: 'B', shots: shots(90) }),
    series({ id: 'C', isShootOff: true, shots: shots(100, 5) }),
  ];
}

describe('stats.ts — a shoot-off is never scored (S2)', () => {
  it('scoredSeries leaves it out in the in-session scope', () => {
    expect(scoredSeries(fixture()).map((s) => s.id)).toEqual(['B']);
  });

  it('scoredSeries leaves it out in the cross-session scope too', () => {
    const list = [...fixture(), series({ id: 'A', isSighter: true, shots: shots(80) })];
    expect(scoredSeries(list, CROSS_SESSION).map((s) => s.id)).toEqual(['B', 'A']);
  });

  it('a shoot-off flagged as a sighter is still left out of the cross-session scope', () => {
    const list = [series({ id: 'D', isSighter: true, isShootOff: true, shots: shots(100) })];
    expect(scoredSeries(list, CROSS_SESSION)).toEqual([]);
  });

  it('scoredShots pools none of its shots', () => {
    expect(scoredShots(fixture())).toHaveLength(5);
    expect(scoredShots(fixture(), CROSS_SESSION)).toHaveLength(5);
  });

  it('S3: volume still counts its shots', () => {
    expect(volumeShotCount(fixture())).toBe(10);
  });

  it('goldSeriesCount never counts a shoot-off, however high', () => {
    const fifty = (isShootOff?: boolean) => series({ isShootOff, shots: shots(100) });
    const options = { birthYear: null };
    expect(goldSeriesCount([fifty(), fifty(false), fifty(true)], options)).toBe(2);
    expect(goldSeriesCount([fifty(true)], options)).toBe(0);
  });
});

describe('analytics.ts — a shoot-off is never scored (S2)', () => {
  it('session points leave it out of total, counts, tens and inner tens', () => {
    for (const scope of [{}, CROSS_SESSION]) {
      const [point] = analyticsSessionPoints(fixture(), scope);
      expect(point).toMatchObject({
        scoredSeriesCount: 1,
        scoredShotCount: 5,
        sessionTotalTenths: 450,
        meanSeriesTotalTenths: 450,
        innerTenCount: 0,
        tenCount: 0,
      });
    }
  });

  it('a shoot-off-only session yields an empty point and no record', () => {
    const list = [series({ isShootOff: true, shots: shots(100, 5) })];
    const points = analyticsSessionPoints(list, CROSS_SESSION);
    expect(points[0]).toMatchObject({ scoredSeriesCount: 0, sessionTotalTenths: 0 });
    expect(analyticsRecords(points)).toEqual({
      bestSessionTotalTenths: null,
      mostInnerTens: null,
      mostTens: null,
    });
  });

  it('records are set by the scoring series, never by a shoot-off', () => {
    const records = analyticsRecords(analyticsSessionPoints(fixture()));
    expect(records.bestSessionTotalTenths?.value).toBe(450);
    expect(records.mostInnerTens?.value).toBe(0);
  });

  it('totals leave it out of every score figure but keep it in volume', () => {
    for (const scope of [{}, CROSS_SESSION]) {
      expect(analyticsTotals(fixture(), scope)).toMatchObject({
        sessionCount: 1,
        scoredSeriesCount: 1,
        volumeShotCount: 10,
        scoredShotCount: 5,
        sumTenths: 450,
        meanSeriesTenths: 450,
        innerTenCount: 0,
        tenCount: 0,
      });
    }
  });

  it('a WS1 override shoot-off carries no score either', () => {
    const override = series({
      isShootOff: true,
      totalOverride: { tenths: 500, shotCount: 5 },
    });
    expect(analyticsTotals([series({ shots: shots(90) }), override])).toMatchObject({
      scoredSeriesCount: 1,
      sumTenths: 450,
      volumeShotCount: 10,
    });
  });

  it('S2-P: adding shoot-off series never changes a session point or the totals', () => {
    const arbSeries = fc.record({
      isSighter: fc.boolean(),
      isShootOff: fc.boolean(),
      values: fc.array(fc.integer({ min: 0, max: 109 }), { maxLength: 6 }),
    });
    fc.assert(
      fc.property(fc.array(arbSeries, { maxLength: 10 }), fc.boolean(), (raw, cross) => {
        const scope = cross ? CROSS_SESSION : {};
        const list = raw.map(({ isSighter, isShootOff, values }) =>
          series({
            isSighter,
            isShootOff,
            shots: values.map((valueTenths) => ({
              valueTenths,
              isInnerTen: valueTenths === 100,
            })),
          }),
        );
        const without = list.filter((s) => s.isShootOff !== true);
        const strip = <T extends { volumeShotCount: number; sessionCount: number }>(t: T) => ({
          ...t,
          volumeShotCount: 0,
          sessionCount: 0,
        });
        expect(strip(analyticsTotals(list, scope))).toEqual(strip(analyticsTotals(without, scope)));
        if (without.length > 0) {
          expect(analyticsSessionPoints(list, scope)).toEqual(
            analyticsSessionPoints(without, scope),
          );
        }
      }),
    );
  });
});

describe('stages.ts — a shoot-off is no part of a delmoment (S2)', () => {
  it('stageSubtotals leaves it out', () => {
    expect(
      stageSubtotals(
        ['A'],
        [
          { stage: 'A', isSighter: false, totalTenths: 450 },
          { stage: 'A', isSighter: false, isShootOff: true, totalTenths: 500 },
          { stage: 'A', isSighter: false, isShootOff: false, totalTenths: 400 },
        ],
      ),
    ).toEqual([{ stage: 'A', totalTenths: 850 }]);
  });

  it('the helmatch tie-break and the session points ignore it', () => {
    const list = [
      series({ disciplineId: 'spsf-helmatch', stage: 'C', shots: shots(90) }),
      series({ disciplineId: 'spsf-helmatch', stage: 'C', isShootOff: true, shots: shots(100) }),
    ];
    expect(analyticsSessionPoints(list)[0]!.tieBreakTenths).toEqual([450, 0]);
    expect(
      tieBreakTenths('spsf-helmatch', [
        { stage: 'C', isSighter: false, isShootOff: true, totalTenths: 500 },
      ]),
    ).toEqual([0, 0]);
  });
});

describe('usual-form.ts — a shoot-off is no part of either side (S2)', () => {
  it('leaves it out of the session side and of the baseline', () => {
    const earlier = (n: number, isShootOff = false) =>
      series({
        sessionId: `old-${n}`,
        startedAt: `2026-04-${String(n).padStart(2, '0')}T10:00:00.000Z`,
        isShootOff,
        shots: shots(isShootOff ? 100 : 80),
      });
    const list = [
      earlier(1),
      earlier(2, true),
      series({ shots: shots(90) }),
      series({ isShootOff: true, shots: shots(100) }),
    ];
    const comparison = compareWithUsualForm(list, 'session-1')!;
    expect(comparison.session).toMatchObject({ seriesCount: 1, totalTenths: 450 });
    expect(comparison.baseline).toMatchObject({ seriesCount: 1, seriesMeanTenths: 400 });
  });
});

describe('sighter-relation.ts — a shoot-off is not the competition result (S2)', () => {
  it('the result mean leaves the shoot-off out', () => {
    const list = Array.from({ length: 10 }, (_unused, index) => {
      const sessionId = `c${index}`;
      const startedAt = `2026-03-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`;
      const base = { sessionId, startedAt, sessionType: 'competition' as const };
      return [
        series({ ...base, isSighter: true, shots: shots(80 + index) }),
        series({ ...base, shots: shots(90) }),
        series({ ...base, isShootOff: true, shots: shots(10) }),
      ];
    }).flat();
    const [relation] = sighterRelation(list);
    expect(relation!.points.every((point) => point.resultMeanShotTenths === 90)).toBe(true);
  });
});

describe('last-time.ts — a shoot-off takes no ordinal and is never compared (S2)', () => {
  const row = (position: number, over: { isSighter?: boolean; isShootOff?: boolean } = {}) => ({
    position,
    isSighter: false,
    isFinal: false,
    totalTenths: position * 10,
    innerTens: 0,
    ...over,
  });

  it('a shoot-off before the current series does not move its ordinal', () => {
    expect(scoredOrdinal([row(1), row(2, { isShootOff: true })], row(3))).toBe(2);
  });

  it('a shoot-off has no ordinal of its own', () => {
    expect(scoredOrdinal([row(1)], row(2, { isShootOff: true }))).toBeNull();
    expect(scoredOrdinal([row(1)], row(2, { isShootOff: false }))).toBe(2);
  });

  it('the previous session’s shoot-off is never the match', () => {
    const previous = [row(1), row(2, { isShootOff: true }), row(3)];
    expect(seriesAtOrdinal(previous, 2, false)?.position).toBe(3);
    expect(seriesAtOrdinal(previous, 3, false)).toBeNull();
  });

  it('picking the previous session is unchanged', () => {
    const session = { id: 'a', disciplineId: 'p', startedAt: '2026-01-01', decimalScoring: false };
    expect(previousSessionOf([session], { ...session, id: 'b', startedAt: '2026-02-01' })).toBe(
      session,
    );
  });
});
