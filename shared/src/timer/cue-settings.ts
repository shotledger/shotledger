// One cue model for every timer. A cue reaches the shooter as a sound, a
// buzz, or both — never neither: a cue nobody can perceive is not a cue, so
// "off" is deliberately absent everywhere below. Silencing a whole timer is
// the phone's job (the silent switch — see platform/timer-cues.ts), not a
// setting here.
//
// Two layers:
//
// - `TimerCueMode` is the three-way choice the maintainer asked for ("1) vib,
//   2) beep 3) vib + beep", #138): how a cue is delivered. The Time Limit and
//   shot timers keep ONE mode for all their events — maintainer, 2026-09-11:
//   "One global setting for all 3 events is good enough. KISS." Per-event
//   choice was built first and thrown away as more control than anyone wanted.
// - `TimerCueDelivery` is one event's resolved cue: which sound (if any) and
//   whether to buzz. The fälttimer stores one per command, because there the
//   sound *kind* matters — a spoken SPSF command, a beep, or the ELD UPPHÖR
//   whistle are all "sound".

/** How a cue is delivered: the three-way choice. */
export type TimerCueMode = 'beep' | 'vibrate' | 'both';

export const TIMER_CUE_MODES: readonly TimerCueMode[] = ['beep', 'vibrate', 'both'];

/** Beep and buzz on every cue — the most noticeable default for a range. */
export const DEFAULT_TIMER_CUE_MODE: TimerCueMode = 'both';

/**
 * What a cue sounds like when it makes a sound. `voice` is a spoken command
 * or prompt (TTS), `whistle` the drawn-out blast that SHB D.6.2 lets replace
 * a spoken ELD UPPHÖR.
 */
export type TimerCueSound = 'voice' | 'beep' | 'whistle';

export const TIMER_CUE_SOUNDS: readonly TimerCueSound[] = ['voice', 'beep', 'whistle'];

/** One event's cue, resolved. `sound: null` is haptic only — the invariant is that both are never off. */
export interface TimerCueDelivery {
  sound: TimerCueSound | null;
  vibrate: boolean;
}

/** How a cue should be delivered under this mode, with `sound` as the sound it makes. Never resolves to nothing. */
export function resolveTimerCue(
  mode: TimerCueMode,
  sound: TimerCueSound = 'beep',
): TimerCueDelivery {
  return { sound: mode === 'vibrate' ? null : sound, vibrate: mode !== 'beep' };
}

/** The three-way mode a delivery amounts to — the inverse of `resolveTimerCue`. */
export function timerCueModeOf(cue: TimerCueDelivery): TimerCueMode {
  if (cue.sound === null) return 'vibrate';
  return cue.vibrate ? 'both' : 'beep';
}

/**
 * Selects `sound`; selecting the sound already on turns the sound off, as a
 * toggle button does — unless that would leave the cue with nothing, in
 * which case the tap is ignored.
 */
export function withTimerCueSound(cue: TimerCueDelivery, sound: TimerCueSound): TimerCueDelivery {
  if (cue.sound !== sound) return { sound, vibrate: cue.vibrate };
  return cue.vibrate ? { sound: null, vibrate: true } : cue;
}

/** Turns the buzz on or off — refusing to turn off the last channel left. */
export function withTimerCueVibrate(cue: TimerCueDelivery, vibrate: boolean): TimerCueDelivery {
  if (!vibrate && cue.sound === null) return cue;
  return { sound: cue.sound, vibrate };
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

/**
 * Validates one stored per-event cue field by field. `allowedSounds` is the
 * caller's — a parti boundary has no words, only ELD UPPHÖR has a whistle —
 * and anything outside it, an unperceivable cue included, falls back whole
 * to `fallback` rather than to a guess at what was meant.
 */
export function normalizeTimerCueDelivery(
  value: unknown,
  allowedSounds: readonly TimerCueSound[],
  fallback: TimerCueDelivery,
): TimerCueDelivery {
  if (typeof value !== 'object' || value === null) return fallback;
  const { sound, vibrate } = value as Record<string, unknown>;
  const soundOk =
    sound === null ||
    (typeof sound === 'string' && (allowedSounds as readonly string[]).includes(sound));
  if (!soundOk || typeof vibrate !== 'boolean') return fallback;
  if (sound === null && !vibrate) return fallback;
  return { sound: sound as TimerCueSound | null, vibrate };
}
