import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  byFalt,
  compareFaltResults,
  faltResult,
  poangfaltPoints,
  scoringStations,
  type FaltStation,
  type FaltStationEntry,
} from './falt';

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

  it('F5: an impossible station throws, naming what is wrong with it', () => {
    // The message matters: these throw at import and at entry time, and
    // "RangeError" alone does not tell anyone which number to fix.
    expect(() => faltResult([station(-1, 0)])).toThrow(/: hits must be an integer 0-6, got -1/u);
    expect(() => faltResult([station(7, 1)])).toThrow(/: hits must be an integer 0-6, got 7/u);
    expect(() => faltResult([station(2.5, 1)])).toThrow(/: hits must be an integer 0-6, got 2.5/u);
    expect(() => faltResult([station(3, -1)])).toThrow(
      /: figuresHit must be an integer 0-3, got -1/u,
    );
    expect(() => faltResult([station(3, 4)])).toThrow(
      /: figuresHit must be an integer 0-3, got 4/u,
    );
    expect(() => faltResult([station(3, 1.5)])).toThrow(
      /: figuresHit must be an integer 0-3, got 1.5/u,
    );
    // Hits without a hit figure: every hit is a hole in some figure's målyta.
    expect(() => faltResult([station(3, 0)])).toThrow(/: 3 hits cannot be spread over 0 figures/u);
    expect(() => faltResult([station(3, 1, -1)])).toThrow(
      /: points must be a non-negative integer or null, got -1/u,
    );
    expect(() => faltResult([station(3, 1, 1.5)])).toThrow(
      /: points must be a non-negative integer or null, got 1.5/u,
    );
    // ...and every message names the offending station, 1-based as SHB numbers.
    expect(() => faltResult([station(6, 2), station(7, 1)])).toThrow(/^station 2: /u);
    expect(() => faltResult([station(-1, 0)])).toThrow(RangeError);
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

  it('F11: the points sum decides even when the last station says otherwise', () => {
    // 12 p over two stations against 10 p — but the 10-p round finished with
    // the stronger station, so a countback alone would invert this.
    const better = [station(6, 3), station(2, 1)];
    const worse = [station(3, 1), station(4, 2)];
    expect(compareFaltResults(better, worse, 'poangfalt')).toBeLessThan(0);
    expect(compareFaltResults(worse, better, 'poangfalt')).toBeGreaterThan(0);
  });

  it('F15: the countback reaches the oldest station both rounds shot', () => {
    // Three stations against two, aligned from the last: the last stations
    // tie on hits, and the pair before them decides.
    const three = [station(2, 1), station(4, 2), station(6, 2)];
    const two = [station(6, 2), station(6, 3)];
    expect(faltResult(three)).toMatchObject({ hits: 12, figuresHit: 5 });
    expect(faltResult(two)).toMatchObject({ hits: 12, figuresHit: 5 });
    expect(compareFaltResults(two, three, 'falt')).toBeLessThan(0);
    expect(compareFaltResults(three, two, 'falt')).toBeGreaterThan(0);
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

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_004
 */
it('ranks a f\u00e4lt round by hits, figures and po\u00e4ng in SHB\u2019s order', () => {
  const round = [station(6, 2, 8), station(4, 3), station(5, 2)];
  expect(faltResult(round)).toEqual({
    stationCount: 3,
    hits: 15,
    figuresHit: 7,
    ringedFigurePoints: 8,
  });
  // Po\u00e4ngf\u00e4lt: one point per hit and one per hit figure, and the po\u00e4ngm\u00e5l's
  // ring points stay out of it (D.6.11 p. 95).
  expect(poangfaltPoints(faltResult(round))).toBe(22);

  const fewerHits = [station(5, 3), station(4, 3), station(5, 2)]; // 14 hits, 8 figures
  // Vanlig f\u00e4lt takes hits first; po\u00e4ngf\u00e4lt sums them, and 22 = 22 sends it
  // to the po\u00e4ngm\u00e5l instead.
  expect(compareFaltResults(round, fewerHits, 'falt')).toBeLessThan(0);
  expect(compareFaltResults(round, fewerHits, 'poangfalt')).toBeLessThan(0);
  expect(compareFaltResults(fewerHits, round, 'poangfalt')).toBeGreaterThan(0);
  // Nothing left to separate them with: the same placement, not a coin toss.
  expect(compareFaltResults(round, [...round], 'falt')).toBe(0);
});

describe('scoringStations (spec S1-S7)', () => {
  /** An entered station: the recorded numbers plus the two flags that can take it out of the result. */
  function entry(
    hits: number,
    figuresHit: number,
    points: number | null = null,
    flags: { isScratched?: boolean; isShootOff?: boolean } = {},
  ): FaltStationEntry {
    return {
      hits,
      figuresHit,
      points,
      isScratched: flags.isScratched ?? false,
      isShootOff: flags.isShootOff ?? false,
    };
  }

  it('S1: keeps plain stations, in order, as scoring stations', () => {
    const entered = [entry(6, 2, 8), entry(4, 3), entry(0, 0)];
    expect(scoringStations(entered)).toEqual([
      { hits: 6, figuresHit: 2, points: 8 },
      { hits: 4, figuresHit: 3, points: null },
      { hits: 0, figuresHit: 0, points: null },
    ]);
  });

  it('S2: drops a scratched station', () => {
    const entered = [entry(6, 2), entry(5, 4, null, { isScratched: true }), entry(4, 3)];
    expect(faltResult(scoringStations(entered))).toEqual({
      stationCount: 2,
      hits: 10,
      figuresHit: 5,
      ringedFigurePoints: null,
    });
  });

  it('S3: drops a särskjutning station — it decides placement, never the score', () => {
    const entered = [entry(6, 2), entry(4, 3), entry(6, 6, null, { isShootOff: true })];
    expect(faltResult(scoringStations(entered))).toEqual({
      stationCount: 2,
      hits: 10,
      figuresHit: 5,
      ringedFigurePoints: null,
    });
  });

  it('S4: drops a station that is both, once', () => {
    const entered = [entry(6, 2), entry(5, 5, 9, { isScratched: true, isShootOff: true })];
    expect(scoringStations(entered)).toEqual([{ hits: 6, figuresHit: 2, points: null }]);
  });

  it('S5: an all-scratched round scores zero rather than failing', () => {
    const entered = [entry(6, 2, 8, { isScratched: true }), entry(4, 3, null, { isScratched: true })];
    expect(scoringStations(entered)).toEqual([]);
    expect(faltResult(scoringStations(entered))).toEqual({
      stationCount: 0,
      hits: 0,
      figuresHit: 0,
      ringedFigurePoints: null,
    });
  });

  it('S6: the countback sees the surviving stations — a scratched last station is not the last', () => {
    // Identical totals over the scoring stations; the rounds differ only on
    // which station ended them, and on what was struck out.
    const a = [entry(5, 3), entry(6, 2), entry(0, 0, null, { isScratched: true })];
    const b = [entry(6, 2), entry(5, 3), entry(6, 6, null, { isScratched: true })];
    // 11 hits in 5 figures each. a ends 6/2, b ends 5/3, and vanlig fält
    // counts back on hits from the last SCORING station — so a wins.
    expect(compareFaltResults(scoringStations(a), scoringStations(b), 'falt')).toBeLessThan(0);
    // The control: count the scratched stations and the result inverts, because
    // b's struck-out 6/6 would carry it to 17 hits against a's 11.
    expect(compareFaltResults(a as FaltStation[], b as FaltStation[], 'falt')).toBeGreaterThan(0);
  });

  it('S7: a scratched station may hold numbers no valid station could', () => {
    // Six hits spread over zero figures is what faltResult refuses to score.
    const impossible = [entry(6, 0, null, { isScratched: true }), entry(4, 3)];
    expect(() => scoringStations(impossible)).not.toThrow();
    expect(faltResult(scoringStations(impossible))).toEqual({
      stationCount: 1,
      hits: 4,
      figuresHit: 3,
      ringedFigurePoints: null,
    });
  });

  it('S8: order and membership hold for any combination of flags', () => {
    const arbitraryEntry = fc.record({
      hits: fc.integer({ min: 0, max: 6 }),
      figuresHit: fc.integer({ min: 0, max: 6 }),
      points: fc.option(fc.integer({ min: 0, max: 50 }), { nil: null }),
      isScratched: fc.boolean(),
      isShootOff: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(arbitraryEntry, { maxLength: 12 }), (entered) => {
        const kept = scoringStations(entered);
        const expected = entered.filter((s) => !s.isScratched && !s.isShootOff);
        expect(kept).toHaveLength(expected.length);
        kept.forEach((station, index) => {
          expect(station).toEqual({
            hits: expected[index]!.hits,
            figuresHit: expected[index]!.figuresHit,
            points: expected[index]!.points,
          });
        });
      }),
    );
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_005
 */
it('records a scratched or särskjutning station without ever scoring it', () => {
  const entered: FaltStationEntry[] = [
    { hits: 6, figuresHit: 2, points: 8, isScratched: false, isShootOff: false },
    { hits: 5, figuresHit: 4, points: 12, isScratched: true, isShootOff: false },
    { hits: 4, figuresHit: 3, points: null, isScratched: false, isShootOff: false },
    { hits: 6, figuresHit: 6, points: null, isScratched: false, isShootOff: true },
  ];

  // Neither the struck-out station's hits nor the särskjutning's reach the
  // result, and the poängmål of a scratched station takes its points with it.
  expect(faltResult(scoringStations(entered))).toEqual({
    stationCount: 2,
    hits: 10,
    figuresHit: 5,
    ringedFigurePoints: 8,
  });

  // The recorded numbers survive: excluding a station is not deleting it.
  expect(entered[1]).toEqual({
    hits: 5,
    figuresHit: 4,
    points: 12,
    isScratched: true,
    isShootOff: false,
  });

  // An all-excluded round is a zero result, not a thrown error.
  const allOut = entered.map((station) => ({ ...station, isScratched: true }));
  expect(faltResult(scoringStations(allOut))).toEqual({
    stationCount: 0,
    hits: 0,
    figuresHit: 0,
    ringedFigurePoints: null,
  });
});
