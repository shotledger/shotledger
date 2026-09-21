import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IPSC_CONFIG,
  DEFAULT_MIN_RISE_DB,
  DEFAULT_MIN_SHOT_GAP_MS,
  IpscTimerEngine,
  MAX_EVENT_MS,
  MAX_TRIGGER_EXCESS_DB,
  MIN_EVENT_MS,
  MIN_TRIGGER_EXCESS_DB,
  RELEASE_EXCESS_DB,
  SENSITIVITY_PRESETS,
  ShotDetector,
  type IpscTimerConfig,
} from './shot-detector';
import { DEFAULT_WINDOW_MS } from './pcm';

/** A quiet indoor range: the level the noise floor settles on in these tests. */
const ROOM_DB = -45;
/** A muzzle blast after AGC has squashed it toward full scale. */
const BLAST_DB = -5;

interface Impulse {
  atMs: number;
  /** Peak level held for the event, in dBFS. */
  peakDb?: number;
  /** How long it stays up. 0 = a single window. */
  durationMs?: number;
}

/**
 * Feeds `totalMs` of room tone at the detector's window rate with the given
 * impulses laid over it, and returns every shot reported. This is the only
 * way to exercise the gate honestly: it measures an event across windows, so
 * a single loud sample is not a shot and no test may pretend otherwise.
 */
function feed(
  detector: ShotDetector,
  totalMs: number,
  impulses: readonly Impulse[] = [],
  roomDb = ROOM_DB,
): ReturnType<ShotDetector['push']>[] {
  const shots = [];
  for (let atMs = 0; atMs <= totalMs; atMs += DEFAULT_WINDOW_MS) {
    let db = roomDb;
    for (const impulse of impulses) {
      const until = impulse.atMs + (impulse.durationMs ?? 0);
      if (atMs >= impulse.atMs && atMs <= until) db = impulse.peakDb ?? BLAST_DB;
    }
    const shot = detector.push({ atMs, db });
    if (shot) shots.push(shot);
  }
  return shots;
}

function armed(options?: ConstructorParameters<typeof ShotDetector>[0]): ShotDetector {
  const detector = new ShotDetector(options);
  detector.arm(0);
  return detector;
}

describe('ShotDetector', () => {
  it('counts an abrupt, brief, loud event as a shot, timed at its onset', () => {
    const detector = armed();
    const shots = feed(detector, 1_000, [{ atMs: 500, durationMs: 20 }]);

    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ index: 0, atMs: 500, splitMs: 500, durationMs: 20 });
    // Measured against the room, not against full scale.
    expect(shots[0]?.excessDb).toBeCloseTo(BLAST_DB - ROOM_DB, 0);
  });

  it('rejects an event that outlasts the gate — the door, not the shot', () => {
    const detector = armed({ maxEventMs: 50 });
    expect(feed(detector, 2_000, [{ atMs: 500, durationMs: 300 }])).toHaveLength(0);
    expect(detector.getLastRejection()).toBe('tooLong');
  });

  it('counts the shot fired once a long noise has ended', () => {
    const detector = armed({ maxEventMs: 50 });
    const shots = feed(detector, 3_000, [
      { atMs: 500, durationMs: 800 },
      { atMs: 1_500, durationMs: 20 },
    ]);
    expect(shots.map((shot) => shot?.atMs)).toEqual([1_500]);
  });

  it('accepts an event right on the gate and rejects the next window past it', () => {
    expect(feed(armed({ maxEventMs: 50 }), 1_000, [{ atMs: 400, durationMs: 50 }])).toHaveLength(1);
    expect(feed(armed({ maxEventMs: 50 }), 1_000, [{ atMs: 400, durationMs: 60 }])).toHaveLength(0);
  });

  it('rejects a loud sound that swells instead of cracking', () => {
    const detector = armed();
    // Same peak — reached in 5 dB steps rather than in one window.
    const ramp: Impulse[] = [-40, -35, -30, -25, -20, -15, -10, BLAST_DB].map((peakDb, step) => ({
      atMs: 500 + step * 10,
      peakDb,
      durationMs: 0,
    }));
    expect(feed(detector, 1_000, ramp)).toHaveLength(0);
    expect(detector.getLastRejection()).toBe('tooSlowRise');
  });

  it('is deaf to the room itself, however loud the room is', () => {
    // AGC lifts a quiet room toward full scale; what matters is that nothing
    // stands out of it.
    expect(feed(armed(), 5_000, [], -6)).toHaveLength(0);
    expect(feed(armed(), 5_000, [], -80)).toHaveLength(0);
  });

  it('measures the trigger against the room, so the same shot counts at any gain', () => {
    const quiet = feed(armed(), 1_000, [{ atMs: 500, peakDb: -40, durationMs: 20 }], -70);
    const loud = feed(armed(), 1_000, [{ atMs: 500, peakDb: -5, durationMs: 20 }], -35);
    expect(quiet).toHaveLength(1);
    expect(loud).toHaveLength(1);
  });

  it('ignores events until armed (shots before the beep do not count)', () => {
    const detector = new ShotDetector();
    expect(detector.isArmed()).toBe(false);
    expect(feed(detector, 1_000, [{ atMs: 500, durationMs: 20 }])).toHaveLength(0);
    expect(detector.getShots()).toHaveLength(0);
  });

  it('still tracks the noise floor before the beep, so the run starts settled', () => {
    const detector = new ShotDetector();
    feed(detector, 2_000);
    expect(detector.getNoiseFloorDb()).toBeCloseTo(ROOM_DB, 1);
  });

  it('times shots from the beep, not from the start of the stream', () => {
    const detector = new ShotDetector();
    // Two seconds of stream before the beep, as "Are you ready?" takes.
    feed(detector, 2_000);
    detector.arm(2_000);
    const shots = feed(detector, 3_000, [{ atMs: 2_500, durationMs: 20 }]).filter(
      (shot) => shot !== null,
    );
    expect(shots[0]).toMatchObject({ atMs: 500, splitMs: 500 });
  });

  it('suppresses a re-trigger inside the minimum gap and allows one after it', () => {
    const detector = armed({ minGapMs: 80 });
    const shots = feed(detector, 2_000, [
      { atMs: 500, durationMs: 20 },
      { atMs: 570, durationMs: 20 },
      { atMs: 700, durationMs: 20 },
    ]);
    expect(shots.map((shot) => shot?.atMs)).toEqual([500, 700]);
    expect(shots[1]).toMatchObject({ index: 1, splitMs: 200 });
  });

  it('defaults the gap to DEFAULT_MIN_SHOT_GAP_MS', () => {
    const inside = feed(armed(), 2_000, [
      { atMs: 500, durationMs: 20 },
      { atMs: 500 + DEFAULT_MIN_SHOT_GAP_MS - 10, durationMs: 20 },
    ]);
    const outside = feed(armed(), 2_000, [
      { atMs: 500, durationMs: 20 },
      { atMs: 500 + DEFAULT_MIN_SHOT_GAP_MS, durationMs: 20 },
    ]);
    expect(inside).toHaveLength(1);
    expect(outside).toHaveLength(2);
  });

  it('ignores non-finite levels and negative timestamps', () => {
    const detector = armed();
    expect(detector.push({ atMs: 10, db: Number.NaN })).toBeNull();
    expect(detector.push({ atMs: -1, db: 0 })).toBeNull();
    expect(detector.getShots()).toHaveLength(0);
  });

  it('orders the sensitivity presets, high being the most permissive', () => {
    expect(SENSITIVITY_PRESETS.high.triggerExcessDb).toBeLessThan(
      SENSITIVITY_PRESETS.medium.triggerExcessDb,
    );
    expect(SENSITIVITY_PRESETS.medium.triggerExcessDb).toBeLessThan(
      SENSITIVITY_PRESETS.low.triggerExcessDb,
    );
    expect(SENSITIVITY_PRESETS.high.maxEventMs).toBeGreaterThan(
      SENSITIVITY_PRESETS.medium.maxEventMs,
    );
    expect(SENSITIVITY_PRESETS.medium.maxEventMs).toBeGreaterThan(
      SENSITIVITY_PRESETS.low.maxEventMs,
    );
  });

  it('applies the preset a sensitivity names, and lets an explicit value override it', () => {
    const quiet: Impulse = { atMs: 500, peakDb: ROOM_DB + 10, durationMs: 20 };
    expect(feed(armed({ sensitivity: 'high' }), 1_000, [quiet])).toHaveLength(1);
    expect(feed(armed({ sensitivity: 'low' }), 1_000, [quiet])).toHaveLength(0);

    const detector = new ShotDetector({ sensitivity: 'low', triggerExcessDb: 8, maxEventMs: 80 });
    expect(detector.getTriggerExcessDb()).toBe(8);
    expect(detector.getMaxEventMs()).toBe(80);
    detector.arm(0);
    expect(feed(detector, 1_000, [quiet])).toHaveLength(1);
  });

  it('defaults to the medium preset', () => {
    const detector = new ShotDetector();
    expect(detector.getTriggerExcessDb()).toBe(SENSITIVITY_PRESETS.medium.triggerExcessDb);
    expect(detector.getMaxEventMs()).toBe(SENSITIVITY_PRESETS.medium.maxEventMs);
  });

  it('rejects options outside their documented ranges', () => {
    expect(() => new ShotDetector({ triggerExcessDb: MIN_TRIGGER_EXCESS_DB - 1 })).toThrow(
      /triggerExcessDb/,
    );
    expect(() => new ShotDetector({ triggerExcessDb: MAX_TRIGGER_EXCESS_DB + 1 })).toThrow(
      /triggerExcessDb/,
    );
    expect(() => new ShotDetector({ triggerExcessDb: Number.NaN })).toThrow(/triggerExcessDb/);
    expect(() => new ShotDetector({ maxEventMs: MIN_EVENT_MS - 1 })).toThrow(/maxEventMs/);
    expect(() => new ShotDetector({ maxEventMs: MAX_EVENT_MS + 1 })).toThrow(/maxEventMs/);
    expect(() => new ShotDetector({ minRiseDb: -1 })).toThrow(/minRiseDb/);
    expect(() => new ShotDetector({ minGapMs: -1 })).toThrow(/minGapMs/);
    expect(() => new ShotDetector({ minGapMs: Number.NaN })).toThrow(/minGapMs/);
    expect(() => new ShotDetector({ triggerExcessDb: MIN_TRIGGER_EXCESS_DB })).not.toThrow();
    expect(() => new ShotDetector({ maxEventMs: MAX_EVENT_MS })).not.toThrow();
  });

  it('documents its hysteresis: release is below trigger, rise is a real jump', () => {
    expect(RELEASE_EXCESS_DB).toBeLessThan(SENSITIVITY_PRESETS.high.triggerExcessDb);
    expect(DEFAULT_MIN_RISE_DB).toBeGreaterThan(0);
  });

  it('does not count one blast twice when its tail is ragged', () => {
    // A decay that dips below the release and comes back is still one shot:
    // the second peak has no rise of its own.
    const detector = armed();
    const shots = feed(detector, 1_000, [
      { atMs: 500, durationMs: 10 },
      { atMs: 530, peakDb: -20, durationMs: 0 },
    ]);
    expect(shots).toHaveLength(1);
  });

  it('summarizes a string: first shot, splits, total and slowest split', () => {
    const detector = armed();
    feed(detector, 3_000, [
      { atMs: 1_200, durationMs: 20 },
      { atMs: 1_500, durationMs: 20 },
      { atMs: 2_100, durationMs: 20 },
    ]);

    expect(detector.getSummary()).toEqual({
      shotCount: 3,
      firstShotMs: 1_200,
      totalMs: 2_100,
      splits: [1_200, 300, 600],
      slowestSplitMs: 600,
      parOverrunMs: undefined,
    });
  });

  it('summarizes an empty run', () => {
    expect(armed().getSummary()).toEqual({
      shotCount: 0,
      firstShotMs: undefined,
      totalMs: undefined,
      splits: [],
      slowestSplitMs: undefined,
      parOverrunMs: undefined,
    });
  });

  it('has no slowest split with a single shot', () => {
    const detector = armed();
    feed(detector, 1_500, [{ atMs: 900, durationMs: 20 }]);
    expect(detector.getSummary().slowestSplitMs).toBeUndefined();
  });

  it('reports a PAR overrun only when the last shot lands after PAR', () => {
    const detector = armed();
    feed(detector, 4_000, [{ atMs: 3_400, durationMs: 20 }]);
    expect(detector.getSummary(4_000).parOverrunMs).toBeUndefined();
    expect(detector.getSummary(3_400).parOverrunMs).toBeUndefined();
    expect(detector.getSummary(3_000).parOverrunMs).toBe(400);
    // No shots at all: nothing to compare against PAR.
    expect(armed().getSummary(1_000).parOverrunMs).toBeUndefined();
  });

  it('reports silence since the last shot, or since the beep with none', () => {
    const detector = armed();
    expect(detector.silenceMsAt(2_000)).toBe(2_000);
    feed(detector, 1_600, [{ atMs: 1_500, durationMs: 20 }]);
    expect(detector.silenceMsAt(2_000)).toBe(500);
  });

  it('resets back to unarmed, empty and with no learned floor', () => {
    const detector = armed();
    feed(detector, 1_000, [{ atMs: 500, durationMs: 20 }]);
    detector.reset();
    expect(detector.isArmed()).toBe(false);
    expect(detector.getShots()).toHaveLength(0);
    expect(feed(detector, 1_000, [{ atMs: 500, durationMs: 20 }])).toHaveLength(0);
  });
});

const FIXED_CONFIG: IpscTimerConfig = {
  readyMs: 1_000,
  randomDelay: { minMs: 2_000, maxMs: 4_000 },
  autoStopSilenceMs: 0,
  sensitivity: 'medium',
};

/** Random delay lands mid-range: 2 000 + 0.5 × 2 000 = 3 000 ms. */
const midRandom = () => 0.5;

function startedRun(config: IpscTimerConfig = FIXED_CONFIG): IpscTimerEngine {
  const engine = new IpscTimerEngine(config, { random: midRandom });
  engine.start();
  return engine;
}

/**
 * Fires one shot-shaped impulse at `atMs` on the engine's window stream.
 * The engine tests advance with the default stream clock, so window times
 * and run times coincide.
 */
function fire(engine: IpscTimerEngine, atMs: number, durationMs = 20, peakDb = BLAST_DB) {
  let shot = null;
  for (
    let t = atMs - DEFAULT_WINDOW_MS;
    t <= atMs + durationMs + DEFAULT_WINDOW_MS;
    t += DEFAULT_WINDOW_MS
  ) {
    const db = t >= atMs && t <= atMs + durationMs ? peakDb : ROOM_DB;
    shot = engine.pushWindow({ atMs: Math.max(0, t), db }) ?? shot;
  }
  return shot;
}

/** Settles the engine's noise floor on the room before anything is fired. */
function settle(engine: IpscTimerEngine, untilMs: number) {
  for (let t = 0; t <= untilMs; t += DEFAULT_WINDOW_MS) engine.pushWindow({ atMs: t, db: ROOM_DB });
}

describe('IpscTimerEngine', () => {
  it('walks idle → ready → standby → running, emitting a cue at each step', () => {
    const engine = new IpscTimerEngine(FIXED_CONFIG, { random: midRandom });
    expect(engine.getPhase().kind).toBe('idle');

    expect(engine.start()).toEqual(['ready']);
    expect(engine.getPhase()).toEqual({ kind: 'ready', remainingMs: 1_000, runElapsedMs: 0 });

    expect(engine.advance(999)).toEqual([]);
    expect(engine.advance(1)).toEqual(['standby']);
    expect(engine.getPhase()).toEqual({ kind: 'standby', remainingMs: 3_000, runElapsedMs: 0 });

    expect(engine.advance(2_999)).toEqual([]);
    expect(engine.advance(1)).toEqual(['start']);
    expect(engine.getPhase()).toEqual({ kind: 'running', remainingMs: 0, runElapsedMs: 0 });
  });

  it('crosses several phases in one advance', () => {
    const engine = startedRun();
    expect(engine.advance(10_000)).toEqual(['standby', 'start']);
    // The 6 000 ms left after the 4 000 ms of ready + standby count as run time.
    expect(engine.getPhase()).toEqual({ kind: 'running', remainingMs: 0, runElapsedMs: 6_000 });
  });

  it('anchors the run to where the beep fell on the audio clock', () => {
    const engine = startedRun();
    // The beep lands 500 ms before this call's stream position (the leftover
    // delta), so a window at stream 9 000 is 500 ms into the run.
    engine.advance(4_500, 8_500);
    expect(engine.pushWindow({ atMs: 8_400, db: ROOM_DB })).toBeNull();
    const shot = fire(engine, 8_500);
    expect(shot).toMatchObject({ atMs: 500 });
  });

  it('draws the standby delay from the configured range', () => {
    const min = new IpscTimerEngine(FIXED_CONFIG, { random: () => 0 });
    min.start();
    min.advance(1_000);
    expect(min.getPhase().remainingMs).toBe(2_000);

    const max = new IpscTimerEngine(FIXED_CONFIG, { random: () => 0.999 });
    max.start();
    max.advance(1_000);
    expect(max.getPhase().remainingMs).toBeCloseTo(3_998, 5);
  });

  it('feeds the floor before the beep but counts no shot until after it', () => {
    const engine = startedRun();
    expect(fire(engine, 500)).toBeNull(); // still in "ready"
    expect(engine.getNoiseFloorDb()).toBeLessThan(0);
    engine.advance(4_000);
    expect(fire(engine, 1_000)).toMatchObject({ atMs: 1_000 });
    engine.stop();
    expect(fire(engine, 2_000)).toBeNull(); // done
  });

  it('times shots from the start beep and summarizes the string', () => {
    const engine = startedRun();
    engine.advance(4_000); // through ready + standby, beep fires
    settle(engine, 1_000);

    fire(engine, 1_100);
    fire(engine, 1_400);
    fire(engine, 1_450); // inside the 80 ms debounce — the same shot's tail
    engine.advance(2_000);

    expect(engine.getShots()).toMatchObject([
      { index: 0, atMs: 1_100, splitMs: 1_100 },
      { index: 1, atMs: 1_400, splitMs: 300 },
    ]);
    expect(engine.getSummary()).toMatchObject({
      shotCount: 2,
      firstShotMs: 1_100,
      totalMs: 1_400,
      splits: [1_100, 300],
    });
  });

  it('reports a PAR overrun from the config', () => {
    const engine = startedRun({ ...FIXED_CONFIG, parMs: 1_000 });
    engine.advance(4_000);
    fire(engine, 1_250);
    expect(engine.getSummary().parOverrunMs).toBe(250);
  });

  it('stops manually and refuses to stop twice', () => {
    const engine = startedRun();
    engine.advance(4_000);
    expect(engine.stop()).toEqual(['stop']);
    expect(engine.getPhase().kind).toBe('done');
    expect(engine.stop()).toEqual([]);
  });

  it('does not stop before the run has started', () => {
    const engine = startedRun();
    expect(engine.stop()).toEqual([]);
    expect(engine.getPhase().kind).toBe('ready');
  });

  it('auto-stops after the configured silence, measured from the last shot', () => {
    const engine = startedRun({ ...FIXED_CONFIG, autoStopSilenceMs: 3_000 });
    engine.advance(4_000);

    engine.advance(2_000);
    fire(engine, 2_000);
    expect(engine.advance(2_900)).toEqual([]); // silence measured from the shot at 2 000
    expect(engine.getPhase().kind).toBe('running');
    expect(engine.advance(100)).toEqual(['stop']);
    expect(engine.getPhase().kind).toBe('done');
  });

  it('auto-stops on silence from the beep when no shot is ever fired', () => {
    const engine = startedRun({ ...FIXED_CONFIG, autoStopSilenceMs: 3_000 });
    engine.advance(4_000);
    expect(engine.advance(3_000)).toEqual(['stop']);
    expect(engine.getSummary().shotCount).toBe(0);
  });

  it('never auto-stops when the silence limit is off', () => {
    const engine = startedRun({ ...FIXED_CONFIG, autoStopSilenceMs: undefined });
    engine.advance(4_000);
    expect(engine.advance(600_000)).toEqual([]);
    expect(engine.getPhase().kind).toBe('running');
  });

  it('advancing while idle or done does nothing', () => {
    const engine = new IpscTimerEngine(FIXED_CONFIG, { random: midRandom });
    expect(engine.advance(5_000)).toEqual([]);
    expect(engine.getPhase().kind).toBe('idle');

    engine.start();
    engine.advance(4_000);
    engine.stop();
    expect(engine.advance(5_000)).toEqual([]);
    expect(engine.getPhase()).toMatchObject({ kind: 'done' });
  });

  it('advance(0) is a no-op', () => {
    const engine = startedRun();
    expect(engine.advance(0)).toEqual([]);
    expect(engine.getPhase().remainingMs).toBe(1_000);
  });

  it('rejects a negative or non-finite delta', () => {
    const engine = startedRun();
    expect(() => engine.advance(-1)).toThrow(/deltaMs/);
    expect(() => engine.advance(Number.POSITIVE_INFINITY)).toThrow(/deltaMs/);
  });

  it('refuses to start mid-run but restarts from done, clearing the previous string', () => {
    const engine = startedRun();
    expect(() => engine.start()).toThrow(/mid-run/);

    engine.advance(4_000);
    fire(engine, 1_000);
    engine.stop();
    expect(engine.getShots()).toHaveLength(1);

    expect(engine.start()).toEqual(['ready']);
    expect(engine.getShots()).toHaveLength(0);
  });

  it('resets to idle and drops the string', () => {
    const engine = startedRun();
    engine.advance(4_000);
    fire(engine, 1_000);
    engine.reset();
    expect(engine.getPhase()).toEqual({ kind: 'idle', remainingMs: 0, runElapsedMs: 0 });
    expect(engine.getSummary().shotCount).toBe(0);
  });

  it('handles a zero-length ready phase', () => {
    const engine = new IpscTimerEngine(
      { ...FIXED_CONFIG, readyMs: 0 },
      { random: () => 0 }, // 2 000 ms standby
    );
    expect(engine.start()).toEqual(['ready']);
    expect(engine.advance(2_000)).toEqual(['standby', 'start']);
    expect(engine.getPhase().kind).toBe('running');
  });

  it('validates its config', () => {
    expect(() => new IpscTimerEngine({ ...FIXED_CONFIG, readyMs: -1 })).toThrow(/readyMs/);
    expect(
      () => new IpscTimerEngine({ ...FIXED_CONFIG, randomDelay: { minMs: -1, maxMs: 1 } }),
    ).toThrow(/minMs/);
    expect(
      () => new IpscTimerEngine({ ...FIXED_CONFIG, randomDelay: { minMs: 3_000, maxMs: 1_000 } }),
    ).toThrow(/maxMs/);
    expect(() => new IpscTimerEngine({ ...FIXED_CONFIG, parMs: 0 })).toThrow(/parMs/);
    expect(
      () => new IpscTimerEngine({ ...FIXED_CONFIG, triggerExcessDb: MAX_TRIGGER_EXCESS_DB + 1 }),
    ).toThrow(/triggerExcessDb/);
    expect(() => new IpscTimerEngine({ ...FIXED_CONFIG, maxEventMs: MAX_EVENT_MS + 1 })).toThrow(
      /maxEventMs/,
    );
  });

  it('uses an explicit trigger excess over the sensitivity preset', () => {
    const engine = startedRun({ ...FIXED_CONFIG, sensitivity: 'low', triggerExcessDb: 8 });
    engine.advance(4_000);
    settle(engine, 500);
    expect(fire(engine, 1_000, 20, ROOM_DB + 10)).not.toBeNull();
  });

  it('ships a usable default config', () => {
    expect(() => new IpscTimerEngine()).not.toThrow();
    expect(DEFAULT_IPSC_CONFIG.randomDelay).toEqual({ minMs: 1_000, maxMs: 4_000 });
  });
});

/**
 * Top-level and identifier-titled so reqstool can match this testcase back to
 * its annotation — see the convention in ADR 0015.
 *
 * @SVCs SVC_TIMER_001
 */
it('a_loud_event_is_rejected_for_being_too_long_or_rising_too_slowly', () => {
  // Loud enough to trigger, but it outlasts the gate — a door, not a shot.
  const long = armed({ maxEventMs: 50 });
  expect(feed(long, 2_000, [{ atMs: 500, durationMs: 300 }])).toHaveLength(0);
  expect(long.getLastRejection()).toBe('tooLong');

  // Same peak, reached in steps rather than in one window.
  const swelling = armed();
  const ramp: Impulse[] = [-40, -35, -30, -25, -20, -15, -10, BLAST_DB].map((peakDb, step) => ({
    atMs: 500 + step * 10,
    peakDb,
    durationMs: 0,
  }));
  expect(feed(swelling, 1_000, ramp)).toHaveLength(0);
  expect(swelling.getLastRejection()).toBe('tooSlowRise');
});
