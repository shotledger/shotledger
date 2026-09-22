import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIMER_SETUP,
  MAX_RANDOM_DELAY_SECONDS,
  MAX_REPETITIONS,
  MAX_TIME_LIMIT_SECONDS,
  autoStopMsFor,
  buildTimerConfig,
  normalizeTimerSetup,
  shotGateFor,
  timerCueDelivery,
  type TimerSetup,
} from './setup';
import { TimerEngine } from './engine';
import { MAX_TRIGGER_EXCESS_DB, MIN_TRIGGER_EXCESS_DB } from './shot-detector';

function setup(overrides: Partial<TimerSetup> = {}): TimerSetup {
  return { ...DEFAULT_TIMER_SETUP, ...overrides };
}

describe('buildTimerConfig', () => {
  it('builds one timed series per repetition, with the rest between them', () => {
    const config = buildTimerConfig(
      setup({ timeLimitSeconds: 2.5, repetitions: 3, restSeconds: 8 }),
    );

    expect(config.series).toEqual([
      { index: 0, durationMs: 2_500 },
      { index: 1, durationMs: 2_500 },
      { index: 2, durationMs: 2_500 },
    ]);
    expect(config.restMs).toBe(8_000);
    expect(config.readyDelayMs).toBe(3_000);
    expect(config.randomReadyDelay).toBeUndefined();
  });

  it('builds an open-ended series when there is no time limit', () => {
    const config = buildTimerConfig(setup({ timeLimitSeconds: 0 }));

    expect(config.series).toEqual([{ index: 0, durationMs: null }]);
  });

  it('draws the start delay from the range under a random start', () => {
    const config = buildTimerConfig(
      setup({ randomStart: true, delayMinSeconds: 1.5, delayMaxSeconds: 4 }),
    );

    expect(config.randomReadyDelay).toEqual({ minMs: 1_500, maxMs: 4_000 });
  });

  it('produces a config the engine accepts, for every shape of setup', () => {
    const shapes: Partial<TimerSetup>[] = [
      {},
      { timeLimitSeconds: 0 },
      { randomStart: true },
      { repetitions: MAX_REPETITIONS, restSeconds: 0, readyDelaySeconds: 0 },
      { timeLimitSeconds: MAX_TIME_LIMIT_SECONDS },
    ];

    for (const shape of shapes) {
      expect(() => new TimerEngine(buildTimerConfig(setup(shape)))).not.toThrow();
    }
  });

  it('clamps a setup on the way to the engine, so a bad slider value cannot reach it', () => {
    const config = buildTimerConfig(setup({ timeLimitSeconds: -5, repetitions: 99.4 }));

    expect(config.series).toHaveLength(MAX_REPETITIONS);
    expect(config.series[0]?.durationMs).toBeNull();
  });
});

describe('normalizeTimerSetup', () => {
  it('falls back to the defaults for a row that is not a setup at all', () => {
    expect(normalizeTimerSetup(null)).toEqual(DEFAULT_TIMER_SETUP);
    expect(normalizeTimerSetup('nonsense')).toEqual(DEFAULT_TIMER_SETUP);
  });

  it('pulls an out-of-range field to its bound and leaves the rest alone', () => {
    const normalized = normalizeTimerSetup({
      ...DEFAULT_TIMER_SETUP,
      repetitions: 5,
      triggerExcessDb: 999,
    });

    expect(normalized.repetitions).toBe(5);
    expect(normalized.triggerExcessDb).toBe(MAX_TRIGGER_EXCESS_DB);
  });

  it('falls back to the default for a field that is not a number at all', () => {
    expect(normalizeTimerSetup({ triggerExcessDb: 'loud' }).triggerExcessDb).toBe(
      DEFAULT_TIMER_SETUP.triggerExcessDb,
    );
    expect(normalizeTimerSetup({ recordShots: 'yes' }).recordShots).toBe(
      DEFAULT_TIMER_SETUP.recordShots,
    );
  });

  it('never lets the random range invert', () => {
    const normalized = normalizeTimerSetup({ delayMinSeconds: 6, delayMaxSeconds: 2 });

    expect(normalized.delayMinSeconds).toBe(6);
    expect(normalized.delayMaxSeconds).toBeGreaterThanOrEqual(6);
    expect(normalized.delayMaxSeconds).toBeLessThanOrEqual(MAX_RANDOM_DELAY_SECONDS);
  });

  it('clamps the detection gate into the range the detector accepts', () => {
    expect(normalizeTimerSetup({ triggerExcessDb: 1 }).triggerExcessDb).toBe(MIN_TRIGGER_EXCESS_DB);
    expect(normalizeTimerSetup({ triggerExcessDb: MAX_TRIGGER_EXCESS_DB }).triggerExcessDb).toBe(
      MAX_TRIGGER_EXCESS_DB,
    );
    expect(normalizeTimerSetup({ triggerExcessDb: MIN_TRIGGER_EXCESS_DB }).triggerExcessDb).toBe(
      MIN_TRIGGER_EXCESS_DB,
    );
  });

  it('refuses a cue mode it cannot deliver', () => {
    expect(normalizeTimerSetup({ cueMode: 'silent' }).cueMode).toBe(DEFAULT_TIMER_SETUP.cueMode);
  });
});

describe('the options shot detection turns on', () => {
  it('reads the microphone only when asked to', () => {
    expect(shotGateFor(setup({ recordShots: false }))).toBeNull();
    expect(shotGateFor(setup({ recordShots: true, triggerExcessDb: 14, maxEventMs: 60 }))).toEqual({
      triggerExcessDb: 14,
      maxEventMs: 60,
    });
  });

  it('auto-stops only an open-ended series that is being listened to', () => {
    expect(autoStopMsFor(setup({ recordShots: true, timeLimitSeconds: 0 }))).toBe(10_000);
    // A timed series ends on its own clock; silence has nothing to end.
    expect(autoStopMsFor(setup({ recordShots: true, timeLimitSeconds: 3 }))).toBe(0);
    // Without the microphone there is no silence to measure.
    expect(autoStopMsFor(setup({ recordShots: false, timeLimitSeconds: 0 }))).toBe(0);
  });

  it('turns the auto-stop off at zero, leaving the string to be stopped by hand', () => {
    expect(
      autoStopMsFor(setup({ recordShots: true, timeLimitSeconds: 0, autoStopSeconds: 0 })),
    ).toBe(0);
  });
});

describe('timerCueDelivery', () => {
  it('speaks only the ready prompt — a spoken GO would blur the start', () => {
    const spoken = setup({ spokenPrompts: true, cueMode: 'both' });

    expect(timerCueDelivery(spoken, 'ready')).toEqual({ sound: 'voice', vibrate: true });
    expect(timerCueDelivery(spoken, 'start')).toEqual({ sound: 'beep', vibrate: true });
    expect(timerCueDelivery(spoken, 'stop')).toEqual({ sound: 'beep', vibrate: true });
  });

  it('beeps the ready prompt when prompts are not spoken', () => {
    expect(timerCueDelivery(setup({ spokenPrompts: false }), 'ready').sound).toBe('beep');
  });

  it('silences the sound in vibrate mode, and the buzz in beep mode', () => {
    expect(timerCueDelivery(setup({ cueMode: 'vibrate' }), 'start')).toEqual({
      sound: null,
      vibrate: true,
    });
    expect(timerCueDelivery(setup({ cueMode: 'beep' }), 'start')).toEqual({
      sound: 'beep',
      vibrate: false,
    });
  });
});
