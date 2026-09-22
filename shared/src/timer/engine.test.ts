import { describe, expect, it } from 'vitest';

import { TimerEngine } from './engine';
import type { TimerConfig } from './types';

function singleSeries(overrides: Partial<TimerConfig> = {}): TimerConfig {
  return {
    readyDelayMs: 1_000,
    series: [{ index: 0, durationMs: 2_000 }],
    restMs: 0,
    ...overrides,
  };
}

function twoSeries(overrides: Partial<TimerConfig> = {}): TimerConfig {
  return {
    readyDelayMs: 500,
    series: [
      { index: 0, durationMs: 1_000 },
      { index: 1, durationMs: 1_500 },
    ],
    restMs: 800,
    ...overrides,
  };
}

describe('TimerEngine validation', () => {
  it('rejects an empty series list', () => {
    expect(() => new TimerEngine({ readyDelayMs: 0, series: [], restMs: 0 })).toThrow(
      /series must not be empty/,
    );
  });

  it('rejects a series whose index does not match its position', () => {
    expect(
      () =>
        new TimerEngine({
          readyDelayMs: 0,
          series: [{ index: 1, durationMs: 1_000 }],
          restMs: 0,
        }),
    ).toThrow(/index must equal 0/);
  });

  it('rejects a non-positive series duration', () => {
    expect(
      () =>
        new TimerEngine({
          readyDelayMs: 0,
          series: [{ index: 0, durationMs: 0 }],
          restMs: 0,
        }),
    ).toThrow(/durationMs must be > 0/);
  });

  it('rejects a negative restMs', () => {
    expect(
      () => new TimerEngine({ readyDelayMs: 0, series: [{ index: 0, durationMs: 1 }], restMs: -1 }),
    ).toThrow(/restMs must be >= 0/);
  });

  it('rejects a negative readyDelayMs', () => {
    expect(
      () => new TimerEngine({ readyDelayMs: -1, series: [{ index: 0, durationMs: 1 }], restMs: 0 }),
    ).toThrow(/readyDelayMs must be >= 0/);
  });

  it('accepts a zero minMs (boundary)', () => {
    expect(
      () =>
        new TimerEngine({
          readyDelayMs: 0,
          randomReadyDelay: { minMs: 0, maxMs: 1 },
          series: [{ index: 0, durationMs: 1 }],
          restMs: 0,
        }),
    ).not.toThrow();
  });

  it('accepts maxMs equal to minMs (boundary)', () => {
    expect(
      () =>
        new TimerEngine({
          readyDelayMs: 0,
          randomReadyDelay: { minMs: 5, maxMs: 5 },
          series: [{ index: 0, durationMs: 1 }],
          restMs: 0,
        }),
    ).not.toThrow();
  });

  it('rejects randomReadyDelay with a negative minMs', () => {
    expect(
      () =>
        new TimerEngine({
          readyDelayMs: 0,
          randomReadyDelay: { minMs: -1, maxMs: 1 },
          series: [{ index: 0, durationMs: 1 }],
          restMs: 0,
        }),
    ).toThrow(/randomReadyDelay.minMs must be >= 0/);
  });

  it('rejects randomReadyDelay with maxMs < minMs', () => {
    expect(
      () =>
        new TimerEngine({
          readyDelayMs: 0,
          randomReadyDelay: { minMs: 5, maxMs: 1 },
          series: [{ index: 0, durationMs: 1 }],
          restMs: 0,
        }),
    ).toThrow(/randomReadyDelay.maxMs must be >= minMs/);
  });
});

describe('TimerEngine idle/start', () => {
  it('starts idle', () => {
    const engine = new TimerEngine(singleSeries());
    expect(engine.getPhase()).toEqual({
      kind: 'idle',
      openEnded: false,
      seriesIndex: -1,
      remainingMs: 0,
      elapsedMs: 0,
    });
    expect(engine.getElapsedMs()).toBe(0);
    expect(engine.currentSeriesSpec()).toBeUndefined();
  });

  it('start() enters readyDelay for series 0 and emits a ready cue', () => {
    const engine = new TimerEngine(singleSeries());
    const events = engine.start();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      atMs: 0,
      cue: { kind: 'ready', seriesIndex: 0, vibrate: false },
      phase: {
        kind: 'readyDelay',
        openEnded: false,
        seriesIndex: 0,
        remainingMs: 1_000,
        elapsedMs: 0,
      },
    });
  });

  it('start() throws when already running', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    expect(() => engine.start()).toThrow(/not idle/);
  });

  it('advance() is a no-op before start()', () => {
    const engine = new TimerEngine(singleSeries());
    expect(engine.advance(500)).toEqual([]);
    expect(engine.getPhase().kind).toBe('idle');
  });

  it('advance() rejects a negative delta', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    expect(() => engine.advance(-1)).toThrow(/deltaMs >= 0/);
  });

  it('advance(0) is accepted (boundary) and is a no-op', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    expect(engine.advance(0)).toEqual([]);
    expect(engine.getPhase()).toEqual({
      kind: 'readyDelay',
      openEnded: false,
      seriesIndex: 0,
      remainingMs: 1_000,
      elapsedMs: 0,
    });
  });
});

describe('TimerEngine single-series PAR drill', () => {
  it('partial advance within readyDelay only updates remaining/elapsed', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    const events = engine.advance(400);
    expect(events).toEqual([]);
    expect(engine.getPhase()).toEqual({
      kind: 'readyDelay',
      openEnded: false,
      seriesIndex: 0,
      remainingMs: 600,
      elapsedMs: 400,
    });
    expect(engine.getElapsedMs()).toBe(400);
  });

  it('crossing readyDelay → series emits a start cue with vibrate', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    const events = engine.advance(1_000); // exactly consumes the 1000ms readyDelay
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      atMs: 1_000,
      cue: { kind: 'start', seriesIndex: 0, vibrate: true },
      phase: { kind: 'series', openEnded: false, seriesIndex: 0, remainingMs: 2_000, elapsedMs: 0 },
    });
  });

  it('running the full drill in one advance() emits start, stop, complete in order and lands on done', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    const events = engine.advance(1_000 + 2_000); // readyDelay + series duration
    expect(events.map((e) => e.cue.kind)).toEqual(['start', 'stop', 'complete']);
    expect(events[1]).toEqual({
      atMs: 3_000,
      cue: { kind: 'stop', seriesIndex: 0, vibrate: true },
      phase: { kind: 'series', openEnded: false, seriesIndex: 0, remainingMs: 0, elapsedMs: 2_000 },
    });
    expect(events[2]).toEqual({
      atMs: 3_000,
      cue: { kind: 'complete', seriesIndex: 0, vibrate: true },
      phase: { kind: 'done', openEnded: false, seriesIndex: -1, remainingMs: 0, elapsedMs: 0 },
    });
    expect(engine.getPhase().kind).toBe('done');
    expect(engine.getElapsedMs()).toBe(3_000);
  });

  it('advance() is a no-op once done', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    engine.advance(3_000);
    expect(engine.advance(500)).toEqual([]);
    expect(engine.getElapsedMs()).toBe(3_000);
  });

  it('overshoots past done: extra time in the same advance() call is simply dropped', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    const events = engine.advance(10_000); // way past the 3000ms drill
    expect(events.map((e) => e.cue.kind)).toEqual(['start', 'stop', 'complete']);
    expect(engine.getElapsedMs()).toBe(3_000);
  });

  it('ticking in small increments crosses the same boundaries as one big jump', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    const events = [
      ...engine.advance(300),
      ...engine.advance(700), // completes readyDelay (1000 total) -> start
      ...engine.advance(1_000),
      ...engine.advance(1_000), // completes series (2000 total) -> stop, complete
    ];
    expect(events.map((e) => e.cue.kind)).toEqual(['start', 'stop', 'complete']);
  });

  it('reset() returns to idle from any phase and clears elapsed time', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    engine.advance(1_500);
    expect(engine.getPhase().kind).toBe('series');
    engine.reset();
    expect(engine.getPhase()).toEqual({
      kind: 'idle',
      openEnded: false,
      seriesIndex: -1,
      remainingMs: 0,
      elapsedMs: 0,
    });
    expect(engine.getElapsedMs()).toBe(0);
    // and can be started again
    const events = engine.start();
    expect(events[0]!.cue.kind).toBe('ready');
  });

  it('reset() from done is a no-op state-wise (already terminal) but still resets cleanly', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    engine.advance(3_000);
    engine.reset();
    expect(engine.getPhase().kind).toBe('idle');
  });
});

describe('TimerEngine multi-series with rest', () => {
  it('rest phase carries the NEXT series index and emits no cue on rest end (only on readyDelay start)', () => {
    const engine = new TimerEngine(twoSeries());
    engine.start(); // readyDelay for series 0
    const toStart0 = engine.advance(500);
    expect(toStart0[0]!.cue).toEqual({ kind: 'start', seriesIndex: 0, vibrate: true });

    const toRest = engine.advance(1_000); // series 0 ends -> stop, enters rest for series 1
    expect(toRest).toHaveLength(1);
    expect(toRest[0]!.cue).toEqual({ kind: 'stop', seriesIndex: 0, vibrate: true });
    expect(engine.getPhase()).toEqual({
      kind: 'rest',
      openEnded: false,
      seriesIndex: 1,
      remainingMs: 800,
      elapsedMs: 0,
    });

    const toReady1 = engine.advance(800); // rest ends -> readyDelay for series 1
    expect(toReady1).toHaveLength(1);
    expect(toReady1[0]!.cue).toEqual({ kind: 'ready', seriesIndex: 1, vibrate: false });

    const toStart1 = engine.advance(500);
    expect(toStart1[0]!.cue).toEqual({ kind: 'start', seriesIndex: 1, vibrate: true });

    const toComplete = engine.advance(1_500);
    expect(toComplete.map((e) => e.cue.kind)).toEqual(['stop', 'complete']);
    expect(toComplete[0]!.cue.seriesIndex).toBe(1);
    expect(toComplete[1]!.cue.seriesIndex).toBe(1);
  });

  it('runs the whole two-series drill in one advance() with events in order', () => {
    const engine = new TimerEngine(twoSeries());
    engine.start();
    const total = 500 + 1_000 + 800 + 500 + 1_500;
    const events = engine.advance(total);
    expect(events.map((e) => e.cue.kind)).toEqual([
      'start',
      'stop',
      'ready',
      'start',
      'stop',
      'complete',
    ]);
    expect(events.map((e) => e.cue.seriesIndex)).toEqual([0, 0, 1, 1, 1, 1]);
    expect(engine.getElapsedMs()).toBe(total);
  });

  it('currentSeriesSpec() reflects the active series', () => {
    const engine = new TimerEngine(twoSeries());
    engine.start();
    engine.advance(500); // into series 0
    expect(engine.currentSeriesSpec()).toEqual({ index: 0, durationMs: 1_000 });
    engine.advance(1_000 + 800); // into readyDelay for series 1
    expect(engine.currentSeriesSpec()).toEqual({ index: 1, durationMs: 1_500 });
  });
});

describe('TimerEngine randomized ready delay', () => {
  it('draws each ready delay from [minMs, maxMs] via the injected RNG, re-drawn per series', () => {
    const config: TimerConfig = {
      readyDelayMs: 0,
      randomReadyDelay: { minMs: 1_000, maxMs: 3_000 },
      series: [
        { index: 0, durationMs: 100 },
        { index: 1, durationMs: 100 },
      ],
      restMs: 0,
    };
    const draws = [0, 1]; // rng() sequence: min, then max
    let call = 0;
    const engine = new TimerEngine(config, { random: () => draws[call++]! });

    const startEvents = engine.start();
    expect(startEvents[0]!.phase.remainingMs).toBe(1_000); // min + 0*(range)

    engine.advance(1_000); // series 0 start
    // One extra ms of budget so the loop carries past the zero-length rest
    // phase and reaches the series-1 readyDelay within this same call.
    const events = engine.advance(101);
    const readyForSeries1 = events.find((e) => e.cue.kind === 'ready');
    expect(readyForSeries1?.cue.seriesIndex).toBe(1);
    expect(readyForSeries1?.phase.remainingMs).toBe(3_000); // min + 1*(range)
  });

  it('defaults to Math.random when no random dep is injected', () => {
    const config: TimerConfig = {
      readyDelayMs: 0,
      randomReadyDelay: { minMs: 100, maxMs: 200 },
      series: [{ index: 0, durationMs: 10 }],
      restMs: 0,
    };
    const engine = new TimerEngine(config);
    const events = engine.start();
    expect(events[0]!.phase.remainingMs).toBeGreaterThanOrEqual(100);
    expect(events[0]!.phase.remainingMs).toBeLessThanOrEqual(200);
  });
});

describe('TimerEngine zero-length phases', () => {
  it('chains through a zero readyDelay and zero rest within a single advance()', () => {
    const config: TimerConfig = {
      readyDelayMs: 0,
      series: [
        { index: 0, durationMs: 100 },
        { index: 1, durationMs: 100 },
      ],
      restMs: 0,
    };
    const engine = new TimerEngine(config);
    engine.start();
    const events = engine.advance(200);
    expect(events.map((e) => e.cue.kind)).toEqual([
      'start',
      'stop',
      'ready',
      'start',
      'stop',
      'complete',
    ]);
  });

  it('getConfig() returns the config passed to the constructor', () => {
    const config = singleSeries();
    const engine = new TimerEngine(config);
    expect(engine.getConfig()).toBe(config);
  });
});

describe('TimerEngine open-ended series', () => {
  function openEnded(overrides: Partial<TimerConfig> = {}): TimerConfig {
    return {
      readyDelayMs: 1_000,
      series: [{ index: 0, durationMs: null }],
      restMs: 0,
      ...overrides,
    };
  }

  it('runs on however long it is advanced, ending only on stopSeries()', () => {
    const engine = new TimerEngine(openEnded());
    engine.start();
    engine.advance(1_000);

    expect(engine.getPhase()).toMatchObject({ kind: 'series', openEnded: true });
    engine.advance(60_000);
    expect(engine.getPhase()).toMatchObject({
      kind: 'series',
      elapsedMs: 60_000,
      // Nothing to count down: the shooter reads the elapsed time instead.
      remainingMs: 0,
    });

    const events = engine.stopSeries();
    expect(events.map((event) => event.cue.kind)).toEqual(['stop', 'complete']);
    expect(engine.getPhase()).toMatchObject({ kind: 'done', openEnded: false });
  });

  it('rests between open-ended repetitions, like a timed one', () => {
    const engine = new TimerEngine(
      openEnded({
        series: [
          { index: 0, durationMs: null },
          { index: 1, durationMs: null },
        ],
        restMs: 2_000,
      }),
    );
    engine.start();
    engine.advance(1_000);
    engine.advance(5_000);

    expect(engine.stopSeries().map((event) => event.cue.kind)).toEqual(['stop']);
    expect(engine.getPhase()).toMatchObject({ kind: 'rest', seriesIndex: 1, openEnded: false });

    engine.advance(2_000 + 1_000);
    expect(engine.getPhase()).toMatchObject({ kind: 'series', seriesIndex: 1, openEnded: true });
  });

  it('accepts a mix of timed and open-ended series', () => {
    const engine = new TimerEngine(
      openEnded({
        series: [
          { index: 0, durationMs: 2_000 },
          { index: 1, durationMs: null },
        ],
        restMs: 0,
      }),
    );
    engine.start();
    engine.advance(1_000 + 2_000 + 1_000);

    expect(engine.getPhase()).toMatchObject({ kind: 'series', seriesIndex: 1, openEnded: true });
  });

  it('ignores stopSeries() outside a series, so a stray tap skips nothing', () => {
    const engine = new TimerEngine(openEnded());

    expect(engine.stopSeries()).toEqual([]);
    engine.start();
    expect(engine.stopSeries()).toEqual([]);
    expect(engine.getPhase().kind).toBe('readyDelay');
  });

  it('stops a timed series early, exactly as its own time running out would', () => {
    const engine = new TimerEngine(singleSeries());
    engine.start();
    engine.advance(1_000 + 500);

    expect(engine.stopSeries().map((event) => event.cue.kind)).toEqual(['stop', 'complete']);
    expect(engine.getPhase().kind).toBe('done');
  });

  it('rejects a duration that is neither positive nor null', () => {
    expect(() => new TimerEngine(openEnded({ series: [{ index: 0, durationMs: 0 }] }))).toThrow(
      /must be > 0 or null/,
    );
  });
});
