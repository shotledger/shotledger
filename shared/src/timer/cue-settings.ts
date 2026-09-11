// How the Time Limit timer's cues reach the shooter: a beep, a buzz, or
// both. One setting for the whole timer — maintainer, 2026-09-11: "One
// global setting for all 3 events is good enough. KISS." Per-event choice
// was built first and thrown away as more control than anyone wanted.
//
// Three options, not four: a cue nobody can perceive is not a cue, so
// "neither" is deliberately absent. Silencing the whole timer is the
// phone's job, not a setting here.
/** What every cue does when it fires. */
export type TimerCueMode = 'beep' | 'vibrate' | 'both';

export const TIMER_CUE_MODES: readonly TimerCueMode[] = ['beep', 'vibrate', 'both'];

/** Beep and buzz on every cue — the most noticeable default for a range. */
export const DEFAULT_TIMER_CUE_MODE: TimerCueMode = 'both';

export interface ResolvedTimerCue {
  beep: boolean;
  vibrate: boolean;
}

/** How a cue should be delivered under this mode. Never resolves to nothing. */
export function resolveTimerCue(mode: TimerCueMode): ResolvedTimerCue {
  return { beep: mode !== 'vibrate', vibrate: mode !== 'beep' };
}

/**
 * Validates a stored value before it reaches the timer, so a row written by
 * an older build — including the per-event object this setting briefly used
 * — cannot hand it a mode it cannot deliver.
 */
export function normalizeTimerCueMode(value: unknown): TimerCueMode {
  return typeof value === 'string' && (TIMER_CUE_MODES as readonly string[]).includes(value)
    ? (value as TimerCueMode)
    : DEFAULT_TIMER_CUE_MODE;
}
