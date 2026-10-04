// Spec: docs/specs/sighter-vs-result-spec.md. Each `SRn` tag in a test name is
// the scenario it asserts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { AnalyticsSeries } from './analytics';
import { describeCorrelation, pearsonCorrelation, sighterRelation } from './sighter-relation';

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
    sessionType: 'competition',
    tagIds: [],
    shots: (values ?? []).map((valueTenths) => ({ valueTenths, isInnerTen: false })),
    ...overrides,
  };
}

const five = (value: number) => [value, value, value, value, value];

/** One competition: a 5-shot sighter and a 5-shot series, each of equal shots. */
function competition(
  index: number,
  sighterTenths: number,
  resultTenths: number,
  overrides: SeriesOverrides = {},
): AnalyticsSeries[] {
  const day = String(index + 1).padStart(2, '0');
  const base = { sessionId: `c${index}`, startedAt: `2026-05-${day}T10:00:00.000Z`, ...overrides };
  return [
    series({ ...base, isSighter: true, values: five(sighterTenths) }),
    series({ ...base, values: five(resultTenths) }),
  ];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('sighterRelation', () => {
  it('SR1: a perfect positive relation', () => {
    const [entry] = sighterRelation(range(10).flatMap((i) => competition(i, 80 + i, 85 + i)));
    expect(entry!.competitionCount).toBe(10);
    expect(entry!.neededMore).toBe(0);
    expect(entry!.correlation!.r).toBeCloseTo(1, 10);
    expect(entry!.correlation).toMatchObject({ strength: 'strong', direction: 'positive' });
  });

  it('SR2: a perfect negative relation', () => {
    const [entry] = sighterRelation(range(10).flatMap((i) => competition(i, 80 + i, 100 - i)));
    expect(entry!.correlation!.r).toBeCloseTo(-1, 10);
    expect(entry!.correlation).toMatchObject({ strength: 'strong', direction: 'negative' });
  });

  it('SR3: below the minimum', () => {
    const [entry] = sighterRelation(range(9).flatMap((i) => competition(i, 80 + i, 85 + i)));
    expect(entry!.competitionCount).toBe(9);
    expect(entry!.neededMore).toBe(1);
    expect(entry!.correlation).toBeNull();
    expect(entry!.points).toHaveLength(9);
  });

  it('SR4: no variance gives no correlation', () => {
    const [flatSighter] = sighterRelation(range(10).flatMap((i) => competition(i, 90, 80 + i)));
    expect(flatSighter!.correlation).toBeNull();
    const [flatResult] = sighterRelation(range(10).flatMap((i) => competition(i, 80 + i, 90)));
    expect(flatResult!.correlation).toBeNull();
  });

  it('SR5: what does not qualify', () => {
    const list = [
      ...competition(0, 90, 90, { sessionType: 'training' }),
      series({ sessionId: 'no-sighter', values: five(90) }),
      series({
        sessionId: 'imported-sighter',
        isSighter: true,
        totalOverride: { tenths: 450, shotCount: 5 },
      }),
      series({ sessionId: 'imported-sighter', values: five(90) }),
      series({ sessionId: 'final-only', isSighter: true, values: five(90) }),
      series({ sessionId: 'final-only', isFinal: true, values: five(90) }),
    ];
    expect(sighterRelation(list)).toEqual([]);
  });

  it('SR6: the point is mean per shot, and a final is not in the result', () => {
    const base = { sessionId: 'c1', startedAt: '2026-05-01T10:00:00.000Z' };
    const [entry] = sighterRelation([
      series({ ...base, isSighter: true, values: [90, 80, 100, 90, 90] }),
      series({ ...base, values: [100, 100, 90, 90, 80] }),
      series({ ...base, values: [90, 90, 90, 80, 80] }),
      series({ ...base, isFinal: true, values: five(100) }),
    ]);
    expect(entry!.points).toEqual([
      {
        sessionId: 'c1',
        startedAt: '2026-05-01T10:00:00.000Z',
        sighterMeanShotTenths: 90,
        resultMeanShotTenths: 89,
      },
    ]);
  });

  it('SR7: stage sighters are pooled', () => {
    const base = { sessionId: 'c1' };
    const [entry] = sighterRelation([
      series({ ...base, isSighter: true, values: five(80) }),
      series({ ...base, isSighter: true, values: five(100) }),
      series({ ...base, values: five(90) }),
    ]);
    expect(entry!.points[0]!.sighterMeanShotTenths).toBe(90);
  });

  it('SR8: disciplines stay apart, ordered by count then id', () => {
    const entries = sighterRelation([
      ...range(10).flatMap((i) => competition(i, 80, 80, { disciplineId: 'spsf-milsnabb' })),
      ...range(12).flatMap((i) => competition(100 + i, 80, 80)),
    ]);
    expect(entries.map((e) => [e.disciplineId, e.competitionCount])).toEqual([
      ['spsf-precision', 12],
      ['spsf-milsnabb', 10],
    ]);
    const tied = sighterRelation([
      ...competition(0, 80, 80, { disciplineId: 'b' }),
      ...competition(1, 80, 80, { disciplineId: 'a' }),
    ]);
    expect(tied.map((e) => e.disciplineId)).toEqual(['a', 'b']);
  });

  it('points are chronological, ties broken by session id', () => {
    const at = '2026-05-01T10:00:00.000Z';
    const [entry] = sighterRelation([
      ...competition(0, 80, 80, { sessionId: 'z', startedAt: '2026-05-03T10:00:00.000Z' }),
      ...competition(1, 80, 80, { sessionId: 'b', startedAt: at }),
      ...competition(2, 80, 80, { sessionId: 'a', startedAt: at }),
    ]);
    expect(entry!.points.map((p) => p.sessionId)).toEqual(['a', 'b', 'z']);
  });

  it('SR10: empty input', () => {
    expect(sighterRelation([])).toEqual([]);
  });
});

describe('describeCorrelation', () => {
  it('SR9: strength buckets and direction', () => {
    expect(describeCorrelation(0.05)).toEqual({ strength: 'none', direction: null });
    expect(describeCorrelation(-0.2)).toEqual({ strength: 'weak', direction: 'negative' });
    expect(describeCorrelation(0.35)).toEqual({ strength: 'moderate', direction: 'positive' });
    expect(describeCorrelation(-0.7)).toEqual({ strength: 'strong', direction: 'negative' });
  });

  it('SR9: bucket edges belong to the stronger bucket', () => {
    expect(describeCorrelation(0.1).strength).toBe('weak');
    expect(describeCorrelation(-0.1).strength).toBe('weak');
    expect(describeCorrelation(0.3).strength).toBe('moderate');
    expect(describeCorrelation(0.5).strength).toBe('strong');
    expect(describeCorrelation(-0.0999).strength).toBe('none');
  });
});

describe('pearsonCorrelation', () => {
  const value = fc.integer({ min: 0, max: 109 });
  const pairs = fc
    .array(fc.tuple(value, value), { minLength: 10, maxLength: 40 })
    .filter(
      (list) => new Set(list.map(([x]) => x)).size > 1 && new Set(list.map(([, y]) => y)).size > 1,
    );

  it('stays within [-1, 1]', () => {
    fc.assert(
      fc.property(pairs, (list) => {
        const r = pearsonCorrelation(
          list.map(([x]) => x),
          list.map(([, y]) => y),
        )!;
        expect(r).toBeGreaterThanOrEqual(-1 - 1e-12);
        expect(r).toBeLessThanOrEqual(1 + 1e-12);
      }),
    );
  });

  it('is unchanged by a positive linear rescaling of either axis', () => {
    fc.assert(
      fc.property(
        pairs,
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (list, scale, shift) => {
          const xs = list.map(([x]) => x);
          const ys = list.map(([, y]) => y);
          const r = pearsonCorrelation(xs, ys)!;
          expect(
            pearsonCorrelation(
              xs.map((x) => x * scale + shift),
              ys,
            )!,
          ).toBeCloseTo(r, 9);
          expect(
            pearsonCorrelation(
              xs,
              ys.map((y) => y * scale + shift),
            )!,
          ).toBeCloseTo(r, 9);
        },
      ),
    );
  });

  it('is symmetric in its axes', () => {
    fc.assert(
      fc.property(pairs, (list) => {
        const xs = list.map(([x]) => x);
        const ys = list.map(([, y]) => y);
        expect(pearsonCorrelation(ys, xs)!).toBeCloseTo(pearsonCorrelation(xs, ys)!, 12);
      }),
    );
  });

  it('is null without variance', () => {
    expect(pearsonCorrelation([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearsonCorrelation([1, 2, 3], [5, 5, 5])).toBeNull();
  });

  it('matches a hand-worked value', () => {
    // x 1..5, y 2 4 5 4 5: Sxy = 6, Sxx = 10, Syy = 6, r = 6 / sqrt(60).
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(6 / Math.sqrt(60), 12);
  });
});
