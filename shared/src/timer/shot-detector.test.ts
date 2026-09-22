import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MIN_RISE_DB,
  DEFAULT_MIN_SHOT_GAP_MS,
  DEFAULT_WINDOW_NOISE_FLOOR,
  MAX_EVENT_MS,
  MAX_TRIGGER_EXCESS_DB,
  MIN_EVENT_MS,
  MIN_TRIGGER_EXCESS_DB,
  RELEASE_EXCESS_DB,
  SENSITIVITY_PRESETS,
  ShotDetector,
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

  it('reports silence since the last shot, or since the beep with none', () => {
    const detector = armed();
    expect(detector.silenceMsAt(2_000)).toBe(2_000);
    feed(detector, 1_600, [{ atMs: 1_500, durationMs: 20 }]);
    expect(detector.silenceMsAt(2_000)).toBe(500);
  });

  it('reports the nominal floor before any window has arrived', () => {
    expect(new ShotDetector().getNoiseFloorDb()).toBe(DEFAULT_WINDOW_NOISE_FLOOR.initialDb);
  });

  it('hears nothing in the very first window — that window is what sets the room', () => {
    const detector = armed();

    // The blast IS the first window, so it seeds the floor and stands 0 dB
    // over it. A detector opened into a loud moment starts from that moment.
    expect(feed(detector, 500, [{ atMs: 0, durationMs: 20 }])).toHaveLength(0);
  });

  it('follows the room down when it goes quiet, not only up', () => {
    const detector = armed();
    feed(detector, 500, [], -20);
    const loudRoom = detector.getNoiseFloorDb();

    feed(detector, 2_000, [], -60);

    expect(detector.getNoiseFloorDb()).toBeLessThan(loudRoom);
  });

  it('rearms for the next series: shots start over, the room is remembered', () => {
    const detector = armed();
    expect(feed(detector, 1_000, [{ atMs: 500, durationMs: 20 }])).toHaveLength(1);
    const floorDb = detector.getNoiseFloorDb();

    detector.rearm(1_000);

    expect(detector.getShots()).toHaveLength(0);
    expect(detector.isArmed()).toBe(true);
    expect(detector.getNoiseFloorDb()).toBe(floorDb);
    // Timed from the new anchor, not from the first series' beep.
    const [shot] = feed(detector, 2_000, [{ atMs: 1_500, durationMs: 20 }]);
    expect(shot?.atMs).toBe(500);
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

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_TIMER_001
 */
it('rejects a loud event for outlasting the gate or for swelling instead of cracking', () => {
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
