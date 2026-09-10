// Per-event cue choice for the Time Limit timer (#138). The engine emits
// cues as data and says nothing about how they are felt; this decides, for
// each event the shooter actually perceives, whether it beeps, vibrates or
// both.
//
// Three options, not four: a cue nobody can perceive is not a cue, so
// "neither" is deliberately absent — the same call §13 settled on. Turning
// the whole timer silent is the phone's job, not a setting here.
//
// The engine's four cue kinds collapse to the three events a shooter names:
// `stop` and `complete` both mean "that's it", so both map to `done`.
import type { TimerCueKind } from './types';

/** What a single event does when it fires. */
export type TimerCueMode = 'beep' | 'vibrate' | 'both';

/** The events a shooter distinguishes, named as the running screen labels them. */
export type TimerCueEvent = 'ready' | 'go' | 'done';

export type TimerCueSettings = Record<TimerCueEvent, TimerCueMode>;

export const TIMER_CUE_EVENTS: readonly TimerCueEvent[] = ['ready', 'go', 'done'];
export const TIMER_CUE_MODES: readonly TimerCueMode[] = ['beep', 'vibrate', 'both'];

/**
 * Reproduces what the timer did before the setting existed: a beep on every
 * cue, and a buzz on everything except Get Ready.
 */
export const DEFAULT_TIMER_CUE_SETTINGS: TimerCueSettings = {
  ready: 'beep',
  go: 'both',
  done: 'both',
};

/** Which shooter-facing event an engine cue belongs to. */
export function cueEventForKind(kind: TimerCueKind): TimerCueEvent {
  if (kind === 'ready') return 'ready';
  if (kind === 'start') return 'go';
  return 'done';
}

export interface ResolvedTimerCue {
  beep: boolean;
  vibrate: boolean;
}

/** How one engine cue should be delivered under these settings. */
export function resolveTimerCue(kind: TimerCueKind, settings: TimerCueSettings): ResolvedTimerCue {
  const mode = settings[cueEventForKind(kind)];
  return { beep: mode !== 'vibrate', vibrate: mode !== 'beep' };
}

/**
 * Validates a stored blob before it reaches the timer. A row written by an
 * older build, or hand-edited, must not be able to hand the engine a mode it
 * cannot deliver — every unknown value falls back to the default.
 */
export function normalizeTimerCueSettings(value: unknown): TimerCueSettings {
  const source = (value ?? {}) as Partial<Record<TimerCueEvent, unknown>>;
  const result = { ...DEFAULT_TIMER_CUE_SETTINGS };
  for (const event of TIMER_CUE_EVENTS) {
    const mode = source[event];
    if (typeof mode === 'string' && (TIMER_CUE_MODES as readonly string[]).includes(mode)) {
      result[event] = mode as TimerCueMode;
    }
  }
  return result;
}
