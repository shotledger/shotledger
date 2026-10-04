// Spec: docs/specs/session-type-comparison-spec.md. Each `TCn` tag in a test
// name is the scenario it asserts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { AnalyticsSeries, AnalyticsSessionType } from './analytics';
import { compareSessionTypes } from './session-type-comparison';

type SeriesOverrides = Partial<AnalyticsSeries> & { values?: readonly number[] };

let seq = 0;

function series({ values, ...overrides }: SeriesOverrides = {}): AnalyticsSeries {
  seq += 1;
  return {
    id: `s${seq}`,
    sessionId: 'session-1',
    startedAt: '2026-05-01T10:00:00.000Z',
    disciplineId: 'spsf-precision',
    isSighter: false,
    isFinal: false,
    sessionType: 'training',
    tagIds: [],
    shots: (values ?? []).map((valueTenths) => ({ valueTenths, isInnerTen: false })),
    ...overrides,
  };
}

/** A series of `length` equal shots totalling `totalTenths`. */
function total(
  totalTenths: number,
  sessionType: AnalyticsSessionType,
  overrides: SeriesOverrides = {},
  length = 5,
): AnalyticsSeries {
  return series({
    sessionType,
    sessionId: sessionType === 'training' ? 'T1' : 'C1',
    values: Array.from({ length }, () => totalTenths / length),
    ...overrides,
  });
}

describe('compareSessionTypes', () => {
  it('TC1: one discipline, both sides', () => {
    const rows = compareSessionTypes([
      total(450, 'training'),
      total(470, 'training'),
      total(430, 'competition'),
      total(410, 'competition'),
    ]);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row!.disciplineId).toBe('spsf-precision');
    expect(row!.seriesLength).toBe(5);
    expect(row!.training).toMatchObject({
      sessionCount: 1,
      seriesCount: 2,
      meanSeriesTenths: 460,
      medianSeriesTenths: 460,
      bestSeriesTenths: 470,
    });
    expect(row!.training.seriesSdTenths).toBeCloseTo(14.142, 3);
    expect(row!.competition).toMatchObject({
      meanSeriesTenths: 420,
      medianSeriesTenths: 420,
      bestSeriesTenths: 430,
    });
    expect(row!.gapSeriesTenths).toBe(-40);
  });

  it('TC2: one side only gives no rows', () => {
    expect(compareSessionTypes([total(450, 'training'), total(460, 'training')])).toEqual([]);
    expect(compareSessionTypes([total(450, 'competition')])).toEqual([]);
  });

  it('TC3: series lengths are not mixed', () => {
    const rows = compareSessionTypes([
      total(450, 'training'),
      total(900, 'training', {}, 10),
      total(440, 'competition'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.seriesLength).toBe(5);
    expect(rows[0]!.training.seriesCount).toBe(1);
    expect(rows[0]!.training.meanSeriesTenths).toBe(450);
  });

  it('TC4: disciplines are not mixed, and rows are ordered by series count', () => {
    const milsnabb = { disciplineId: 'spsf-milsnabb' };
    const rows = compareSessionTypes([
      total(450, 'training', milsnabb),
      total(440, 'competition', milsnabb),
      total(430, 'competition', milsnabb),
      total(450, 'training'),
      total(460, 'training'),
      total(470, 'training'),
      total(440, 'competition'),
      total(430, 'competition'),
      total(420, 'competition'),
    ]);
    expect(rows.map((row) => row.disciplineId)).toEqual(['spsf-precision', 'spsf-milsnabb']);
    expect(rows[1]!.training.meanSeriesTenths).toBe(450);
    expect(rows[1]!.competition.meanSeriesTenths).toBe(435);
  });

  it('TC4: equal series counts order by discipline id, then series length', () => {
    const rows = compareSessionTypes([
      total(450, 'training', { disciplineId: 'b' }),
      total(450, 'competition', { disciplineId: 'b' }),
      total(900, 'training', { disciplineId: 'a' }, 10),
      total(900, 'competition', { disciplineId: 'a' }, 10),
      total(450, 'training', { disciplineId: 'a' }),
      total(450, 'competition', { disciplineId: 'a' }),
    ]);
    expect(rows.map((row) => `${row.disciplineId}/${row.seriesLength}`)).toEqual([
      'a/5',
      'a/10',
      'b/5',
    ]);
  });

  it('TC4: the order counts both sides, not the difference between them', () => {
    const lopsided = { disciplineId: 'a' };
    const even = { disciplineId: 'b' };
    const rows = compareSessionTypes([
      total(450, 'training', lopsided),
      total(450, 'competition', lopsided),
      total(450, 'competition', lopsided),
      total(450, 'competition', lopsided),
      total(450, 'competition', lopsided),
      total(450, 'training', even),
      total(450, 'training', even),
      total(450, 'competition', even),
      total(450, 'competition', even),
    ]);
    expect(rows.map((row) => row.disciplineId)).toEqual(['a', 'b']);
    const reversed = compareSessionTypes([
      total(450, 'training', { disciplineId: 'b' }),
      total(450, 'competition', { disciplineId: 'b' }),
      total(450, 'competition', { disciplineId: 'b' }),
      total(450, 'competition', { disciplineId: 'b' }),
      total(450, 'competition', { disciplineId: 'b' }),
      total(450, 'training', { disciplineId: 'a' }),
      total(450, 'training', { disciplineId: 'a' }),
      total(450, 'competition', { disciplineId: 'a' }),
      total(450, 'competition', { disciplineId: 'a' }),
    ]);
    expect(reversed.map((row) => row.disciplineId)).toEqual(['b', 'a']);
  });

  it('TC5: sighters follow the report scope', () => {
    const list = [
      total(300, 'competition', { isSighter: true }),
      total(450, 'competition'),
      total(440, 'training'),
    ];
    expect(compareSessionTypes(list)[0]!.competition.meanSeriesTenths).toBe(450);
    expect(
      compareSessionTypes(list, { includeSighters: true })[0]!.competition.meanSeriesTenths,
    ).toBe(375);
  });

  it('TC6: imported totals count as series, not as shots', () => {
    const imported = (tenths: number) =>
      series({
        sessionType: 'competition',
        sessionId: 'C1',
        totalOverride: { tenths, shotCount: 5 },
      });
    const rows = compareSessionTypes([imported(480), imported(460), total(450, 'training')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.seriesLength).toBe(5);
    expect(rows[0]!.competition.meanSeriesTenths).toBe(470);
    expect(rows[0]!.competition.meanShotTenths).toBeNull();
    expect(rows[0]!.competition.innerTensPerSeries).toBeNull();
  });

  it('TC7: median of an odd and an even count', () => {
    const odd = compareSessionTypes([
      total(400, 'training'),
      total(500, 'training'),
      total(450, 'training'),
      total(450, 'competition'),
    ]);
    expect(odd[0]!.training.medianSeriesTenths).toBe(450);
    const even = compareSessionTypes([
      total(400, 'training'),
      total(500, 'training'),
      total(450, 'training'),
      total(470, 'training'),
      total(450, 'competition'),
    ]);
    expect(even[0]!.training.medianSeriesTenths).toBe(460);
  });

  it('TC8: session counts are distinct sessions', () => {
    const rows = compareSessionTypes([
      total(450, 'training', { sessionId: 'T1' }),
      total(450, 'training', { sessionId: 'T1' }),
      total(450, 'training', { sessionId: 'T1' }),
      total(450, 'training', { sessionId: 'T2' }),
      total(450, 'competition'),
    ]);
    expect(rows[0]!.training.sessionCount).toBe(2);
    expect(rows[0]!.training.seriesCount).toBe(4);
    expect(rows[0]!.competition.sessionCount).toBe(1);
  });

  it('TC9: SD needs two series', () => {
    const rows = compareSessionTypes([total(450, 'training'), total(440, 'competition')]);
    expect(rows[0]!.training.seriesSdTenths).toBeNull();
  });

  it('TC9: SD is the sample SD, over n - 1', () => {
    const rows = compareSessionTypes([
      total(400, 'training'),
      total(500, 'training'),
      total(450, 'training'),
      total(450, 'competition'),
    ]);
    expect(rows[0]!.training.seriesSdTenths).toBe(50);
  });

  it('TC10: inner tens per series, and the mean per shot', () => {
    const withX = (count: number) =>
      series({
        sessionType: 'training',
        sessionId: 'T1',
        shots: Array.from({ length: 5 }, (_, i) => ({ valueTenths: 100, isInnerTen: i < count })),
      });
    const rows = compareSessionTypes([withX(3), withX(1), total(450, 'competition')]);
    expect(rows[0]!.training.innerTensPerSeries).toBe(2);
    expect(rows[0]!.training.meanShotTenths).toBe(100);
    expect(rows[0]!.competition.meanShotTenths).toBe(90);
    expect(rows[0]!.competition.innerTensPerSeries).toBe(0);
  });

  it('TC11: empty input, and empty series, give no rows', () => {
    expect(compareSessionTypes([])).toEqual([]);
    expect(
      compareSessionTypes([
        series({ sessionType: 'training' }),
        series({ sessionType: 'competition' }),
      ]),
    ).toEqual([]);
  });

  it('TC12: equal sides have no gap', () => {
    const rows = compareSessionTypes([total(450, 'training'), total(450, 'competition')]);
    expect(rows[0]!.gapSeriesTenths).toBe(0);
  });

  it('swapping every session type swaps the sides and negates the gap', () => {
    const one = fc.record({
      sessionType: fc.constantFrom<AnalyticsSessionType>('training', 'competition'),
      sessionId: fc.constantFrom('a', 'b', 'c'),
      disciplineId: fc.constantFrom('spsf-precision', 'spsf-milsnabb'),
      values: fc.array(fc.integer({ min: 0, max: 109 }), { minLength: 1, maxLength: 6 }),
    });
    fc.assert(
      fc.property(fc.array(one, { maxLength: 30 }), (records) => {
        const list = records.map((record) => series(record));
        const swapped = list.map((s) => {
          const sessionType: AnalyticsSessionType =
            s.sessionType === 'training' ? 'competition' : 'training';
          return { ...s, sessionType };
        });
        const before = compareSessionTypes(list);
        const after = compareSessionTypes(swapped);
        expect(after.map((row) => [row.disciplineId, row.seriesLength])).toEqual(
          before.map((row) => [row.disciplineId, row.seriesLength]),
        );
        after.forEach((row, i) => {
          expect(row.training).toEqual(before[i]!.competition);
          expect(row.competition).toEqual(before[i]!.training);
          expect(row.gapSeriesTenths).toBeCloseTo(-before[i]!.gapSeriesTenths, 9);
        });
      }),
    );
  });
});
