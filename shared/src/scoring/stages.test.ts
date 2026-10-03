import { describe, expect, it } from 'vitest';

import { ranksAhead, stageSubtotals, tieBreakTenths, type StagedSeriesTotal } from './stages';

const s = (stage: string | null, points: number, isSighter = false): StagedSeriesTotal => ({
  stage,
  isSighter,
  totalTenths: points * 10,
});

describe('stageSubtotals', () => {
  it('S1: subtotals per stage in the stages order, sighters excluded', () => {
    const series = [
      s('A', 45, true),
      s('A', 48),
      s('A', 47),
      s('B', 40, true),
      s('B', 44),
      s('C', 46),
      s('C', 42),
    ];
    expect(stageSubtotals(['A', 'B', 'C'], series)).toEqual([
      { stage: 'A', totalTenths: 950 },
      { stage: 'B', totalTenths: 440 },
      { stage: 'C', totalTenths: 880 },
    ]);
  });

  it('S2: a stage with no scored series is 0, not absent', () => {
    expect(stageSubtotals(['A', 'B', 'C'], [s('A', 50), s('B', 49, true)])).toEqual([
      { stage: 'A', totalTenths: 500 },
      { stage: 'B', totalTenths: 0 },
      { stage: 'C', totalTenths: 0 },
    ]);
  });

  it('S3: a series without a stage, or with an unlisted stage, moves nothing', () => {
    expect(stageSubtotals(['A'], [s(null, 50), s('D', 50), s('A', 10)])).toEqual([
      { stage: 'A', totalTenths: 100 },
    ]);
    expect(stageSubtotals([], [s('A', 50)])).toEqual([]);
  });
});

describe('tieBreakTenths (SHB I.6.11.2.1)', () => {
  it('T1: helmatch keys are C, then B', () => {
    const series = [s('A', 50), s('B', 45), s('B', 45), s('C', 47), s('C', 48), s('C', 1, true)];
    expect(tieBreakTenths('spsf-helmatch', series)).toEqual([950, 900]);
  });

  it('T2: other disciplines have no keys', () => {
    expect(tieBreakTenths('spsf-precision', [s('C', 50)])).toEqual([]);
    expect(tieBreakTenths('spsf-figurskjutning', [s(null, 50)])).toEqual([]);
  });
});

describe('ranksAhead', () => {
  const r = (total: number, ...keys: number[]) => ({ totalTenths: total, tieBreakTenths: keys });

  it('T3: a higher total ranks ahead whatever the keys say', () => {
    expect(ranksAhead(r(5610, 0, 0), r(5600, 2000, 2000))).toBe(true);
    expect(ranksAhead(r(5600, 2000, 2000), r(5610, 0, 0))).toBe(false);
  });

  it('T4: on equal totals the higher C ranks ahead even with a lower B', () => {
    expect(ranksAhead(r(5600, 1900, 1700), r(5600, 1890, 1900))).toBe(true);
    expect(ranksAhead(r(5600, 1890, 1900), r(5600, 1900, 1700))).toBe(false);
  });

  it('T5: on equal totals and C the higher B ranks ahead', () => {
    expect(ranksAhead(r(5600, 1900, 1810), r(5600, 1900, 1800))).toBe(true);
    expect(ranksAhead(r(5600, 1900, 1800), r(5600, 1900, 1810))).toBe(false);
  });

  it('T6: equal on total, C and B: neither ranks ahead — A never breaks a tie', () => {
    expect(ranksAhead(r(5600, 1900, 1800), r(5600, 1900, 1800))).toBe(false);
    expect(ranksAhead(r(5600), r(5600))).toBe(false);
  });

  it('T7: keys of unequal length compare over the shared prefix only', () => {
    expect(ranksAhead(r(5600, 1900), r(5600))).toBe(false);
    expect(ranksAhead(r(5600), r(5600, 1900))).toBe(false);
    expect(ranksAhead(r(5600, 1900, 1), r(5600, 1900))).toBe(false);
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_008
 */
it('sums each helmatch delmoment without its sighter and ranks an equal total on C, then B', () => {
  const session = (b: number, c: number) => [
    s('A', 45, true),
    s('A', 50),
    s('B', 45, true),
    s('B', b),
    s('C', c),
  ];
  const first = session(50, 40);
  const second = session(40, 50);
  expect(stageSubtotals(['A', 'B', 'C'], first).map((x) => x.totalTenths)).toEqual([500, 500, 400]);
  const ranked = (series: StagedSeriesTotal[]) => ({
    totalTenths: 1400,
    tieBreakTenths: tieBreakTenths('spsf-helmatch', series),
  });
  expect(ranksAhead(ranked(second), ranked(first))).toBe(true);
  expect(ranksAhead(ranked(first), ranked(second))).toBe(false);
});
