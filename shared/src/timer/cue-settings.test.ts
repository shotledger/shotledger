import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIMER_CUE_MODE,
  TIMER_CUE_MODES,
  normalizeTimerCueMode,
  resolveTimerCue,
} from './cue-settings';

describe('resolveTimerCue', () => {
  it('beep plays sound only, vibrate buzzes only, both do both', () => {
    expect(resolveTimerCue('beep')).toEqual({ beep: true, vibrate: false });
    expect(resolveTimerCue('vibrate')).toEqual({ beep: false, vibrate: true });
    expect(resolveTimerCue('both')).toEqual({ beep: true, vibrate: true });
  });

  it('never resolves to nothing at all — a cue is always perceivable', () => {
    for (const mode of TIMER_CUE_MODES) {
      const resolved = resolveTimerCue(mode);
      expect(resolved.beep || resolved.vibrate).toBe(true);
    }
  });
});

describe('normalizeTimerCueMode', () => {
  it('keeps every recognised mode', () => {
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
