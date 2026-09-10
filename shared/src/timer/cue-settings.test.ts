import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIMER_CUE_SETTINGS,
  TIMER_CUE_EVENTS,
  TIMER_CUE_MODES,
  cueEventForKind,
  normalizeTimerCueSettings,
  resolveTimerCue,
  type TimerCueSettings,
} from './cue-settings';
import type { TimerCueKind } from './types';

const ALL_KINDS: readonly TimerCueKind[] = ['ready', 'start', 'stop', 'complete'];

describe('cueEventForKind', () => {
  it('maps both end-of-drill cues onto one shooter-facing event', () => {
    expect(cueEventForKind('stop')).toBe('done');
    expect(cueEventForKind('complete')).toBe('done');
  });

  it('maps the other kinds one-to-one', () => {
    expect(cueEventForKind('ready')).toBe('ready');
    expect(cueEventForKind('start')).toBe('go');
  });

  it('every engine cue kind lands on a known event', () => {
    for (const kind of ALL_KINDS) {
      expect(TIMER_CUE_EVENTS).toContain(cueEventForKind(kind));
    }
  });
});

describe('resolveTimerCue', () => {
  it('beep plays sound only, vibrate buzzes only, both do both', () => {
    const settings: TimerCueSettings = { ready: 'beep', go: 'vibrate', done: 'both' };
    expect(resolveTimerCue('ready', settings)).toEqual({ beep: true, vibrate: false });
    expect(resolveTimerCue('start', settings)).toEqual({ beep: false, vibrate: true });
    expect(resolveTimerCue('complete', settings)).toEqual({ beep: true, vibrate: true });
  });

  it('never resolves to nothing at all — a cue is always perceivable', () => {
    for (const mode of TIMER_CUE_MODES) {
      for (const kind of ALL_KINDS) {
        const resolved = resolveTimerCue(kind, { ready: mode, go: mode, done: mode });
        expect(resolved.beep || resolved.vibrate).toBe(true);
      }
    }
  });

  it('the defaults reproduce the pre-setting behaviour', () => {
    // Engine hard-coded `vibrate: false` on ready and true on the rest.
    expect(resolveTimerCue('ready', DEFAULT_TIMER_CUE_SETTINGS)).toEqual({
      beep: true,
      vibrate: false,
    });
    for (const kind of ['start', 'stop', 'complete'] as const) {
      expect(resolveTimerCue(kind, DEFAULT_TIMER_CUE_SETTINGS)).toEqual({
        beep: true,
        vibrate: true,
      });
    }
  });
});

describe('normalizeTimerCueSettings', () => {
  it('keeps every recognised mode', () => {
    const stored = { ready: 'vibrate', go: 'beep', done: 'both' };
    expect(normalizeTimerCueSettings(stored)).toEqual(stored);
  });

  it.each([null, undefined, {}, 'nonsense', 42, []])('falls back to defaults for %p', (input) => {
    expect(normalizeTimerCueSettings(input)).toEqual(DEFAULT_TIMER_CUE_SETTINGS);
  });

  it('replaces only the unrecognised events, keeping the valid ones', () => {
    expect(normalizeTimerCueSettings({ ready: 'vibrate', go: 'silent', done: null })).toEqual({
      ready: 'vibrate',
      go: DEFAULT_TIMER_CUE_SETTINGS.go,
      done: DEFAULT_TIMER_CUE_SETTINGS.done,
    });
  });
});
