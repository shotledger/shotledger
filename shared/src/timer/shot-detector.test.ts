import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IPSC_CONFIG,
  DEFAULT_MIN_SHOT_GAP_MS,
  IpscTimerEngine,
  MAX_TRIGGER_DB,
  MIN_TRIGGER_DB,
  SENSITIVITY_THRESHOLD_DB,
  ShotDetector,
  type IpscTimerConfig,
} from './shot-detector';

const LOUD = 0;

function armed(options?: ConstructorParameters<typeof ShotDetector>[0]): ShotDetector {
  const detector = new ShotDetector(options);
  detector.arm();
  return detector;
}

describe('ShotDetector', () => {
  it('ignores samples until armed (shots before the beep do not count)', () => {
    const detector = new ShotDetector();
    expect(detector.isArmed()).toBe(false);
    expect(detector.push({ atMs: 0, db: LOUD })).toBeNull();
    expect(detector.getShots()).toHaveLength(0);

    detector.arm();
    expect(detector.push({ atMs: 10, db: LOUD })).not.toBeNull();
  });

  it('detects a shot on a sample at or above the threshold', () => {
    const detector = armed({ thresholdDb: -20 });
    expect(detector.push({ atMs: 100, db: -21 })).toBeNull();
    expect(detector.push({ atMs: 200, db: -20 })).toEqual({
      index: 0,
      atMs: 200,
      splitMs: 200,
    });
  });

  it('suppresses a double trigger inside the minimum gap and allows one after it', () => {
    const detector = armed({ minGapMs: 80 });
    detector.push({ atMs: 500, db: LOUD });
    expect(detector.push({ atMs: 500 + 79, db: LOUD })).toBeNull();
    const second = detector.push({ atMs: 500 + 80, db: LOUD });
    expect(second).toEqual({ index: 1, atMs: 580, splitMs: 80 });
    expect(detector.getShots()).toHaveLength(2);
  });

  it('defaults the gap to DEFAULT_MIN_SHOT_GAP_MS', () => {
    const detector = armed();
    detector.push({ atMs: 0, db: LOUD });
    expect(detector.push({ atMs: DEFAULT_MIN_SHOT_GAP_MS - 1, db: LOUD })).toBeNull();
    expect(detector.push({ atMs: DEFAULT_MIN_SHOT_GAP_MS, db: LOUD })).not.toBeNull();
  });

  it('rejects a negative minimum gap', () => {
    expect(() => new ShotDetector({ minGapMs: -1 })).toThrow(/minGapMs/);
    expect(() => new ShotDetector({ minGapMs: Number.NaN })).toThrow(/minGapMs/);
  });

  it('ignores non-finite levels and negative timestamps', () => {
    const detector = armed();
    expect(detector.push({ atMs: 10, db: Number.NaN })).toBeNull();
    expect(detector.push({ atMs: -1, db: LOUD })).toBeNull();
    expect(detector.getShots()).toHaveLength(0);
  });

  it('applies the sensitivity presets, high triggering on the quietest peak', () => {
    expect(SENSITIVITY_THRESHOLD_DB.high).toBeLessThan(SENSITIVITY_THRESHOLD_DB.medium);
    expect(SENSITIVITY_THRESHOLD_DB.medium).toBeLessThan(SENSITIVITY_THRESHOLD_DB.low);

    const peak = SENSITIVITY_THRESHOLD_DB.high;
    expect(armed({ sensitivity: 'high' }).push({ atMs: 0, db: peak })).not.toBeNull();
    expect(armed({ sensitivity: 'medium' }).push({ atMs: 0, db: peak })).toBeNull();
    expect(armed({ sensitivity: 'low' }).push({ atMs: 0, db: peak })).toBeNull();
    // A muzzle blast at full scale is a shot at every sensitivity.
    expect(armed({ sensitivity: 'low' }).push({ atMs: 0, db: LOUD })).not.toBeNull();
  });

  it('defaults to medium sensitivity', () => {
    const detector = armed();
    expect(detector.push({ atMs: 0, db: SENSITIVITY_THRESHOLD_DB.medium })).not.toBeNull();
    expect(armed().push({ atMs: 0, db: SENSITIVITY_THRESHOLD_DB.medium - 0.1 })).toBeNull();
  });

  it('accepts an explicit numeric thresholdDb overriding the sensitivity preset', () => {
    const detector = new ShotDetector({ sensitivity: 'low', thresholdDb: -40 });
    expect(detector.getThresholdDb()).toBe(-40);
    detector.arm();
    expect(detector.push({ atMs: 0, db: -41 })).toBeNull();
    expect(detector.push({ atMs: 0, db: -40 })).not.toBeNull();
  });

  it('rejects a thresholdDb outside MIN_TRIGGER_DB..MAX_TRIGGER_DB', () => {
    expect(() => new ShotDetector({ thresholdDb: MIN_TRIGGER_DB - 1 })).toThrow(/thresholdDb/);
    expect(() => new ShotDetector({ thresholdDb: MAX_TRIGGER_DB + 1 })).toThrow(/thresholdDb/);
    expect(() => new ShotDetector({ thresholdDb: Number.NaN })).toThrow(/thresholdDb/);
    expect(() => new ShotDetector({ thresholdDb: MIN_TRIGGER_DB })).not.toThrow();
    expect(() => new ShotDetector({ thresholdDb: MAX_TRIGGER_DB })).not.toThrow();
  });

  it('summarizes a string: first shot, splits, total and slowest split', () => {
    const detector = armed();
    for (const atMs of [1_200, 1_500, 2_100]) detector.push({ atMs, db: LOUD });

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
    detector.push({ atMs: 900, db: LOUD });
    expect(detector.getSummary().slowestSplitMs).toBeUndefined();
  });

  it('reports a PAR overrun only when the last shot lands after PAR', () => {
    const detector = armed();
    detector.push({ atMs: 3_400, db: LOUD });
    expect(detector.getSummary(4_000).parOverrunMs).toBeUndefined();
    expect(detector.getSummary(3_400).parOverrunMs).toBeUndefined();
    expect(detector.getSummary(3_000).parOverrunMs).toBe(400);
    // No shots at all: nothing to compare against PAR.
    expect(armed().getSummary(1_000).parOverrunMs).toBeUndefined();
  });

  it('reports silence since the last shot, or since the beep with none', () => {
    const detector = armed();
    expect(detector.silenceMsAt(2_000)).toBe(2_000);
    detector.push({ atMs: 1_500, db: LOUD });
    expect(detector.silenceMsAt(2_000)).toBe(500);
  });

  it('resets back to unarmed and empty', () => {
    const detector = armed();
    detector.push({ atMs: 100, db: LOUD });
    detector.reset();
    expect(detector.isArmed()).toBe(false);
    expect(detector.getShots()).toHaveLength(0);
    expect(detector.push({ atMs: 200, db: LOUD })).toBeNull();
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

  it('ignores levels outside the running phase', () => {
    const engine = startedRun();
    expect(engine.pushLevel(0)).toBeNull(); // still in "ready"
    engine.advance(4_000);
    expect(engine.pushLevel(0)).toEqual({ index: 0, atMs: 0, splitMs: 0 });
    engine.stop();
    expect(engine.pushLevel(0)).toBeNull(); // done
  });

  it('times shots from the start beep and summarizes the string', () => {
    const engine = startedRun();
    engine.advance(4_000); // through ready + standby, beep fires

    engine.advance(1_100);
    engine.pushLevel(0);
    engine.advance(300);
    engine.pushLevel(0);
    engine.advance(20); // inside the 80 ms debounce — the same shot's tail
    engine.pushLevel(0);
    engine.advance(400);
    engine.pushLevel(-60); // too quiet

    expect(engine.getShots()).toEqual([
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
    engine.advance(1_250);
    engine.pushLevel(0);
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
    engine.pushLevel(0);
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
    engine.pushLevel(0);
    engine.stop();
    expect(engine.getShots()).toHaveLength(1);

    expect(engine.start()).toEqual(['ready']);
    expect(engine.getShots()).toHaveLength(0);
  });

  it('resets to idle and drops the string', () => {
    const engine = startedRun();
    engine.advance(4_000);
    engine.pushLevel(0);
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
    expect(() => new IpscTimerEngine({ ...FIXED_CONFIG, thresholdDb: MAX_TRIGGER_DB + 1 })).toThrow(
      /thresholdDb/,
    );
  });

  it('uses an explicit thresholdDb over the sensitivity preset', () => {
    const engine = startedRun({ ...FIXED_CONFIG, sensitivity: 'low', thresholdDb: -40 });
    engine.advance(4_000);
    expect(engine.pushLevel(-41)).toBeNull();
    expect(engine.pushLevel(-40)).not.toBeNull();
  });

  it('ships a usable default config', () => {
    expect(() => new IpscTimerEngine()).not.toThrow();
    expect(DEFAULT_IPSC_CONFIG.randomDelay).toEqual({ minMs: 1_000, maxMs: 4_000 });
  });
});
