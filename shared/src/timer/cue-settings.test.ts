import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIMER_CUE_MODE,
  TIMER_CUE_MODES,
  TIMER_CUE_SOUNDS,
  normalizeTimerCueDelivery,
  normalizeTimerCueMode,
  resolveTimerCue,
  timerCueModeOf,
  withTimerCueSound,
  withTimerCueVibrate,
  type TimerCueDelivery,
} from './cue-settings';

const perceivable = (cue: TimerCueDelivery) => cue.sound !== null || cue.vibrate;

describe('resolveTimerCue', () => {
  it('beep plays sound only, vibrate buzzes only, both do both', () => {
    expect(resolveTimerCue('beep')).toEqual({ sound: 'beep', vibrate: false });
    expect(resolveTimerCue('vibrate')).toEqual({ sound: null, vibrate: true });
    expect(resolveTimerCue('both')).toEqual({ sound: 'beep', vibrate: true });
  });

  it('carries the sound kind through, and drops it only in vibrate mode', () => {
    expect(resolveTimerCue('beep', 'voice')).toEqual({ sound: 'voice', vibrate: false });
    expect(resolveTimerCue('both', 'whistle')).toEqual({ sound: 'whistle', vibrate: true });
    expect(resolveTimerCue('vibrate', 'voice')).toEqual({ sound: null, vibrate: true });
  });

  it('never resolves to nothing at all — a cue is always perceivable', () => {
    for (const mode of TIMER_CUE_MODES) {
      for (const sound of TIMER_CUE_SOUNDS) {
        expect(perceivable(resolveTimerCue(mode, sound))).toBe(true);
      }
    }
  });

  it('round-trips through timerCueModeOf', () => {
    for (const mode of TIMER_CUE_MODES) {
      expect(timerCueModeOf(resolveTimerCue(mode))).toBe(mode);
      expect(timerCueModeOf(resolveTimerCue(mode, 'voice'))).toBe(mode);
    }
  });
});

describe('withTimerCueSound', () => {
  it('switches the sound and keeps the buzz as it was', () => {
    expect(withTimerCueSound({ sound: 'voice', vibrate: true }, 'beep')).toEqual({
      sound: 'beep',
      vibrate: true,
    });
    expect(withTimerCueSound({ sound: null, vibrate: true }, 'whistle')).toEqual({
      sound: 'whistle',
      vibrate: true,
    });
  });

  it('selecting the sound already on turns the sound off when the buzz remains', () => {
    expect(withTimerCueSound({ sound: 'voice', vibrate: true }, 'voice')).toEqual({
      sound: null,
      vibrate: true,
    });
  });

  it('refuses to turn the sound off when it is the only channel', () => {
    const cue: TimerCueDelivery = { sound: 'beep', vibrate: false };
    expect(withTimerCueSound(cue, 'beep')).toBe(cue);
  });
});

describe('withTimerCueVibrate', () => {
  it('turns the buzz on and off beside a sound', () => {
    expect(withTimerCueVibrate({ sound: 'beep', vibrate: false }, true)).toEqual({
      sound: 'beep',
      vibrate: true,
    });
    expect(withTimerCueVibrate({ sound: 'beep', vibrate: true }, false)).toEqual({
      sound: 'beep',
      vibrate: false,
    });
  });

  it('refuses to turn the buzz off when it is the only channel', () => {
    const cue: TimerCueDelivery = { sound: null, vibrate: true };
    expect(withTimerCueVibrate(cue, false)).toBe(cue);
  });

  it('never produces an unperceivable cue, whatever the sequence of taps', () => {
    let cue: TimerCueDelivery = { sound: 'voice', vibrate: true };
    const taps: (() => TimerCueDelivery)[] = [
      () => withTimerCueVibrate(cue, false),
      () => withTimerCueSound(cue, 'voice'),
      () => withTimerCueSound(cue, 'beep'),
      () => withTimerCueVibrate(cue, true),
      () => withTimerCueSound(cue, 'beep'),
      () => withTimerCueVibrate(cue, false),
    ];
    for (const tap of taps) {
      cue = tap();
      expect(perceivable(cue)).toBe(true);
    }
  });
});

describe('normalizeTimerCueMode', () => {
  it('keeps every recognized mode', () => {
    for (const mode of TIMER_CUE_MODES) {
      expect(normalizeTimerCueMode(mode)).toBe(mode);
    }
  });

  it.each([null, undefined, {}, 'silent', 42, []])('falls back to the default for %p', (input) => {
    expect(normalizeTimerCueMode(input)).toBe(DEFAULT_TIMER_CUE_MODE);
  });

  it('falls back for the per-event object this setting briefly stored', () => {
    expect(normalizeTimerCueMode({ ready: 'beep', go: 'both', done: 'both' })).toBe(
      DEFAULT_TIMER_CUE_MODE,
    );
  });
});

describe('normalizeTimerCueDelivery', () => {
  const fallback: TimerCueDelivery = { sound: 'voice', vibrate: false };
  const allowed = ['voice', 'beep'] as const;

  it('keeps a valid stored cue', () => {
    expect(normalizeTimerCueDelivery({ sound: 'beep', vibrate: true }, allowed, fallback)).toEqual({
      sound: 'beep',
      vibrate: true,
    });
    expect(normalizeTimerCueDelivery({ sound: null, vibrate: true }, allowed, fallback)).toEqual({
      sound: null,
      vibrate: true,
    });
  });

  it.each([null, undefined, 'beep', 7, [], {}])('falls back for %p', (input) => {
    expect(normalizeTimerCueDelivery(input, allowed, fallback)).toBe(fallback);
  });

  it('falls back for a sound this event cannot make', () => {
    expect(normalizeTimerCueDelivery({ sound: 'whistle', vibrate: true }, allowed, fallback)).toBe(
      fallback,
    );
    expect(normalizeTimerCueDelivery({ sound: 'siren', vibrate: true }, allowed, fallback)).toBe(
      fallback,
    );
  });

  it('falls back for a malformed vibrate flag', () => {
    expect(normalizeTimerCueDelivery({ sound: 'beep', vibrate: 'yes' }, allowed, fallback)).toBe(
      fallback,
    );
    expect(normalizeTimerCueDelivery({ sound: 'beep' }, allowed, fallback)).toBe(fallback);
  });

  it('falls back for an unperceivable cue rather than guessing what was meant', () => {
    expect(normalizeTimerCueDelivery({ sound: null, vibrate: false }, allowed, fallback)).toBe(
      fallback,
    );
  });

  it('drops any extra fields a stored blob carries', () => {
    expect(
      normalizeTimerCueDelivery({ sound: 'voice', vibrate: true, volume: 3 }, allowed, fallback),
    ).toEqual({ sound: 'voice', vibrate: true });
  });
});
