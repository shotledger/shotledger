import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { byFalt, compareFaltResults, faltResult, poangfaltPoints, type FaltStation } from './falt';

/** A station, written the way SHB marks one: hits, figures, optional poäng. */
function station(hits: number, figuresHit: number, points: number | null = null): FaltStation {
  return { hits, figuresHit, points };
}

describe('faltResult (spec F1-F5)', () => {
  it('F1: an empty round is zero hits in zero figures, with no poäng', () => {
    expect(faltResult([])).toEqual({
      stationCount: 0,
      hits: 0,
      figuresHit: 0,
      ringedFigurePoints: null,
    });
  });

  it('F2: sums hits, figures and stations', () => {
    expect(faltResult([station(6, 2), station(4, 3), station(0, 0)])).toEqual({
      stationCount: 3,
      hits: 10,
      figuresHit: 5,
      ringedFigurePoints: null,
    });
  });

  it('F3: ringedFigurePoints sums only the stations that carry a poängmål', () => {
    expect(faltResult([station(6, 2, 13), station(4, 3)]).ringedFigurePoints).toBe(13);
    expect(faltResult([station(6, 2, 13), station(4, 3, 7)]).ringedFigurePoints).toBe(20);
    // A poängmål that scored nothing is still a poängmål: 0, not null.
    expect(faltResult([station(6, 2, 0), station(4, 3)]).ringedFigurePoints).toBe(0);
  });

  it('F4: poängfält points are hits + figures, never the poängmål ring points', () => {
    const plain = faltResult([station(6, 2), station(4, 3), station(0, 0)]);
    expect(poangfaltPoints(plain)).toBe(15);
    const withRingPoints = faltResult([station(6, 2, 13), station(4, 3), station(0, 0)]);
    expect(poangfaltPoints(withRingPoints)).toBe(15);
  });

  it('F5: an impossible station throws rather than scoring', () => {
    expect(() => faltResult([station(-1, 0)])).toThrow(RangeError);
    expect(() => faltResult([station(7, 1)])).toThrow(RangeError);
    expect(() => faltResult([station(3, -1)])).toThrow(RangeError);
    expect(() => faltResult([station(3, 4)])).toThrow(RangeError);
    // Hits without a hit figure: every hit is a hole in some figure's målyta.
    expect(() => faltResult([station(3, 0)])).toThrow(RangeError);
    expect(() => faltResult([station(3, 1, -1)])).toThrow(RangeError);
    expect(() => faltResult([station(2.5, 1)])).toThrow(RangeError);
    expect(() => faltResult([station(3, 1.5)])).toThrow(RangeError);
    expect(() => faltResult([station(3, 1, 1.5)])).toThrow(RangeError);
    // ...and the message names the offending station, 1-based as SHB numbers.
    expect(() => faltResult([station(6, 2), station(7, 1)])).toThrow(/station 2/u);
  });

  it('F5: the legal extremes are accepted', () => {
    // Six hits in one figure is legal (D.10.3 p. 117, always so in poängfält),
    // and a zero station is an ordinary bad station.
    expect(faltResult([station(6, 1), station(0, 0)])).toMatchObject({ hits: 6, figuresHit: 1 });
  });
});

describe('compareFaltResults, vanlig fält (D.6.11.2.1.1, spec F6-F10)', () => {
  it('F6: more hits ranks first', () => {
    const better = [station(6, 3), station(4, 2)]; // 10 hits
    const worse = [station(5, 3), station(4, 2)]; // 9 hits
    expect(compareFaltResults(better, worse, 'falt')).toBeLessThan(0);
    expect(compareFaltResults(worse, better, 'falt')).toBeGreaterThan(0);
  });

  it('F7: on equal hits, more figures hit ranks first', () => {
    const more = [station(6, 4), station(4, 2)]; // 10 hits in 6 figures
    const fewer = [station(6, 2), station(4, 3)]; // 10 hits in 5 figures
    expect(compareFaltResults(more, fewer, 'falt')).toBeLessThan(0);
    expect(compareFaltResults(fewer, more, 'falt')).toBeGreaterThan(0);
  });

  it('F8: then the designated poängmål decides, and an absent one counts as zero', () => {
    const scored = [station(6, 3, 9), station(4, 2)];
    const less = [station(6, 3, 4), station(4, 2)];
    const none = [station(6, 3), station(4, 2)];
    expect(compareFaltResults(scored, less, 'falt')).toBeLessThan(0);
    expect(compareFaltResults(less, none, 'falt')).toBeLessThan(0);
    expect(compareFaltResults(none, less, 'falt')).toBeGreaterThan(0);
  });

  it('F9: then the last station, then the next-to-last, on hits', () => {
    // Same 10 hits in 5 figures, no poäng; only where the hits fell differs.
    const strongFinish = [station(4, 2), station(6, 3)];
    const strongStart = [station(6, 3), station(4, 2)];
    expect(compareFaltResults(strongFinish, strongStart, 'falt')).toBeLessThan(0);

    // Last station equal -> the next-to-last decides.
    const lateSurge = [station(3, 2), station(5, 2), station(2, 1)];
    const earlySurge = [station(5, 2), station(3, 2), station(2, 1)];
    expect(compareFaltResults(lateSurge, earlySurge, 'falt')).toBeLessThan(0);
    expect(compareFaltResults(earlySurge, lateSurge, 'falt')).toBeGreaterThan(0);
  });

  it('F10: rounds equal on every term share the placement', () => {
    const round = [station(6, 3, 7), station(4, 2)];
    expect(compareFaltResults(round, [...round], 'falt')).toBe(0);
  });
});

describe('compareFaltResults, poängfält (D.6.11.2.1.2, spec F11-F15)', () => {
  it('F11: ranks on hits + figures', () => {
    const better = [station(5, 4), station(4, 2)]; // 9 hits, 6 figures = 15 p
    const worse = [station(6, 2), station(4, 2)]; // 10 hits, 4 figures = 14 p
    expect(compareFaltResults(better, worse, 'poangfalt')).toBeLessThan(0);
    // ...and vanlig fält ranks that same pair the other way round.
    expect(compareFaltResults(better, worse, 'falt')).toBeGreaterThan(0);
  });

  it('F12: on equal points, the ringed figure decides', () => {
    const scored = [station(6, 3, 11), station(4, 2)];
    const none = [station(6, 3), station(4, 2)];
    expect(compareFaltResults(scored, none, 'poangfalt')).toBeLessThan(0);
    expect(compareFaltResults(none, scored, 'poangfalt')).toBeGreaterThan(0);
  });

  it('F13: then the last station on hits + figures, not on hits alone', () => {
    // Both rounds: 10 hits, 5 figures, 15 p, no poängmål. Their last stations
    // have the same HITS (4) but different point sums (4+2 vs 4+3), so a
    // hits-only countback cannot separate them — and vanlig fält's does not.
    const a = [station(6, 3), station(4, 2)];
    const b = [station(6, 2), station(4, 3)];
    expect(compareFaltResults(b, a, 'poangfalt')).toBeLessThan(0);
    expect(compareFaltResults(a, b, 'falt')).toBe(0);
  });

  it('F14: 24 hits in 8 figures loses on hits and wins on points', () => {
    const wide = [station(6, 2), station(6, 2), station(6, 2), station(6, 2)];
    const deep = [station(6, 1), station(6, 1), station(6, 2), station(6, 1), station(1, 1)];
    expect(faltResult(wide)).toMatchObject({ hits: 24, figuresHit: 8 }); // 32 p
    expect(faltResult(deep)).toMatchObject({ hits: 25, figuresHit: 6 }); // 31 p
    expect(compareFaltResults(deep, wide, 'falt')).toBeLessThan(0);
    expect(compareFaltResults(deep, wide, 'poangfalt')).toBeGreaterThan(0);
  });

  it('F15: a countback stops where the shorter round runs out', () => {
    // Nine stations against eight, aligned from the last: every compared pair
    // is equal and the longer round's extra FIRST station is never compared
    // against nothing, so the two share the placement.
    const eight = Array.from({ length: 8 }, () => station(3, 2));
    const nine = [station(0, 0), ...eight];
    expect(faltResult(nine)).toMatchObject({ hits: 24, figuresHit: 16, stationCount: 9 });
    expect(compareFaltResults(nine, eight, 'falt')).toBe(0);
    expect(compareFaltResults(nine, eight, 'poangfalt')).toBe(0);
  });
});

describe('sorting and algebra (spec F16-F17)', () => {
  it('F16: byFalt sorts best first', () => {
    const top = [station(6, 3), station(6, 3)]; // 12 hits, 6 figures
    const middle = [station(6, 3), station(5, 3)]; // 11 hits, 6 figures
    const bottom = [station(4, 2), station(4, 2)]; // 8 hits, 4 figures
    expect([bottom, top, middle].sort(byFalt('falt'))).toEqual([top, middle, bottom]);
    expect([middle, bottom, top].sort(byFalt('poangfalt'))).toEqual([top, middle, bottom]);
  });

  it('F17: the comparator is reflexive and antisymmetric', () => {
    const arbStation = fc.integer({ min: 0, max: 6 }).chain((hits) =>
      fc.record({
        hits: fc.constant(hits),
        figuresHit: hits === 0 ? fc.constant(0) : fc.integer({ min: 1, max: hits }),
        points: fc.option(fc.nat(50)),
      }),
    );
    const arbRound = fc.array(arbStation, { maxLength: 10 });
    const arbMode = fc.constantFrom('falt' as const, 'poangfalt' as const);

    fc.assert(
      fc.property(arbRound, arbRound, arbMode, (a, b, mode) => {
        // Summed rather than negated: `Object.is(-0, 0)` is false, so
        // `sign(x) === -sign(y)` fails on a genuine tie for a reason that is
        // about JS, not about ranking.
        expect(
          Math.sign(compareFaltResults(a, b, mode)) + Math.sign(compareFaltResults(b, a, mode)),
        ).toBe(0);
        expect(compareFaltResults(a, a, mode)).toBe(0);
      }),
    );
  });
});
