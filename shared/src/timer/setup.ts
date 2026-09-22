// The timer's setup: what the controls span, what a stored row is allowed to
// say, and the engine config they describe.
//
// One setup, not two (#346). The PAR/interval timer and the IPSC-style shot
// timer were the same machine all along — a sequence of timed phases with
// cues — differing only in which fields they exposed. So the random start
// delay, the open-ended string and the microphone are options on this one
// setup rather than a second timer:
//
//   timeLimitSeconds 0   the series runs until you stop it (or until the
//                        auto-stop, with the microphone on) — the IPSC string
//   randomStart          the start signal cannot be anticipated
//   recordShots          the microphone records splits for any of the above
//
// The bounds are slider ends, not engine limits: the engine runs any positive
// duration, these are the values worth dialling in by dragging.
import {
  DEFAULT_TIMER_CUE_MODE,
  normalizeTimerCueMode,
  resolveTimerCue,
  type TimerCueDelivery,
  type TimerCueMode,
} from './cue-settings';
import {
  MAX_EVENT_MS,
  MAX_TRIGGER_EXCESS_DB,
  MIN_EVENT_MS,
  MIN_TRIGGER_EXCESS_DB,
  SENSITIVITY_PRESETS,
} from './shot-detector';
import type { SeriesSpec, TimerConfig } from './types';

/** Half-second granularity: a 1.5 s par time is a real drill, a 1.51 s one is not. */
export const TIME_LIMIT_STEP_SECONDS = 0.5;
/** 0 is the open-ended string, so the shortest *timed* series starts above it. */
export const MIN_TIME_LIMIT_SECONDS = 0;
export const MAX_TIME_LIMIT_SECONDS = 60;

/** Past ~15 s a fixed wait stops reading as a start signal. */
export const MAX_READY_DELAY_SECONDS = 15;
/** The random range's end — past this a random wait stops being a start signal either. */
export const MAX_RANDOM_DELAY_SECONDS = 10;

export const MIN_REPETITIONS = 1;
export const MAX_REPETITIONS = 20;

export const MAX_REST_SECONDS = 120;

/** Longest stretch of silence the auto-stop offers before it ends an open-ended string. */
export const MAX_AUTO_STOP_SECONDS = 30;

export interface TimerSetup {
  /** Per repetition. 0 = no limit: the series runs until it is stopped. */
  timeLimitSeconds: number;
  /** Draw the start delay from [delayMinSeconds, delayMaxSeconds] instead of waiting `readyDelaySeconds`. */
  randomStart: boolean;
  readyDelaySeconds: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  /** 1 = the plain "beep, shoot, beep" drill; more makes it an interval drill. */
  repetitions: number;
  restSeconds: number;
  /** Listen on the microphone and record each shot's split. */
  recordShots: boolean;
  /** How far over the room a sound must rise to be considered (MIN/MAX_TRIGGER_EXCESS_DB). */
  triggerExcessDb: number;
  /** Longest event still counted as a shot, in ms (MIN/MAX_EVENT_MS). */
  maxEventMs: number;
  /** End an open-ended series after this much silence; 0 = stop it by hand. */
  autoStopSeconds: number;
  /** How every cue is delivered — one choice for all of them. */
  cueMode: TimerCueMode;
  /** Speak "Get ready" and "Standby" instead of beeping them. */
  spokenPrompts: boolean;
}

export const DEFAULT_TIMER_SETUP: TimerSetup = {
  timeLimitSeconds: 3,
  randomStart: false,
  readyDelaySeconds: 3,
  delayMinSeconds: 1,
  delayMaxSeconds: 4,
  repetitions: 1,
  restSeconds: 0,
  recordShots: false,
  triggerExcessDb: SENSITIVITY_PRESETS.medium.triggerExcessDb,
  maxEventMs: SENSITIVITY_PRESETS.medium.maxEventMs,
  autoStopSeconds: 10,
  cueMode: DEFAULT_TIMER_CUE_MODE,
  spokenPrompts: true,
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Clamps a setup — from a slider, or straight out of the settings table —
 * into the bounds above. A bad field falls back to its default rather than
 * throwing: no single out-of-range number should cost the shooter the rest of
 * their setup, and the engine rejects a whole config if one reaches it.
 */
export function normalizeTimerSetup(value: unknown): TimerSetup {
  const stored = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const delayMinSeconds = clamp(
    stored.delayMinSeconds,
    0,
    MAX_RANDOM_DELAY_SECONDS,
    DEFAULT_TIMER_SETUP.delayMinSeconds,
  );
  return {
    timeLimitSeconds: clamp(
      stored.timeLimitSeconds,
      MIN_TIME_LIMIT_SECONDS,
      MAX_TIME_LIMIT_SECONDS,
      DEFAULT_TIMER_SETUP.timeLimitSeconds,
    ),
    randomStart: boolean(stored.randomStart, DEFAULT_TIMER_SETUP.randomStart),
    readyDelaySeconds: clamp(
      stored.readyDelaySeconds,
      0,
      MAX_READY_DELAY_SECONDS,
      DEFAULT_TIMER_SETUP.readyDelaySeconds,
    ),
    delayMinSeconds,
    // The high thumb can never sit below the low one, whatever was stored.
    delayMaxSeconds: clamp(
      stored.delayMaxSeconds,
      delayMinSeconds,
      MAX_RANDOM_DELAY_SECONDS,
      Math.max(delayMinSeconds, DEFAULT_TIMER_SETUP.delayMaxSeconds),
    ),
    repetitions: Math.round(
      clamp(stored.repetitions, MIN_REPETITIONS, MAX_REPETITIONS, DEFAULT_TIMER_SETUP.repetitions),
    ),
    restSeconds: clamp(stored.restSeconds, 0, MAX_REST_SECONDS, DEFAULT_TIMER_SETUP.restSeconds),
    recordShots: boolean(stored.recordShots, DEFAULT_TIMER_SETUP.recordShots),
    triggerExcessDb: clamp(
      stored.triggerExcessDb,
      MIN_TRIGGER_EXCESS_DB,
      MAX_TRIGGER_EXCESS_DB,
      DEFAULT_TIMER_SETUP.triggerExcessDb,
    ),
    maxEventMs: clamp(
      stored.maxEventMs,
      MIN_EVENT_MS,
      MAX_EVENT_MS,
      DEFAULT_TIMER_SETUP.maxEventMs,
    ),
    autoStopSeconds: clamp(
      stored.autoStopSeconds,
      0,
      MAX_AUTO_STOP_SECONDS,
      DEFAULT_TIMER_SETUP.autoStopSeconds,
    ),
    cueMode: normalizeTimerCueMode(stored.cueMode),
    spokenPrompts: boolean(stored.spokenPrompts, DEFAULT_TIMER_SETUP.spokenPrompts),
  };
}

/** The engine config this setup describes. */
export function buildTimerConfig(setup: TimerSetup): TimerConfig {
  const normalized = normalizeTimerSetup(setup);
  const { timeLimitSeconds, repetitions, restSeconds } = normalized;

  const durationMs = timeLimitSeconds > 0 ? Math.round(timeLimitSeconds * 1_000) : null;
  const series: SeriesSpec[] = Array.from({ length: repetitions }, (_, index) => ({
    index,
    durationMs,
  }));

  return {
    readyDelayMs: Math.round(normalized.readyDelaySeconds * 1_000),
    ...(normalized.randomStart
      ? {
          randomReadyDelay: {
            minMs: Math.round(normalized.delayMinSeconds * 1_000),
            maxMs: Math.round(normalized.delayMaxSeconds * 1_000),
          },
        }
      : {}),
    series,
    restMs: Math.round(restSeconds * 1_000),
  };
}

/** The gate the microphone is read through, or null when shots are not being recorded. */
export function shotGateFor(
  setup: TimerSetup,
): { triggerExcessDb: number; maxEventMs: number } | null {
  if (!setup.recordShots) return null;
  return { triggerExcessDb: setup.triggerExcessDb, maxEventMs: setup.maxEventMs };
}

/**
 * How one cue is delivered. Only the ready and standby prompts can be spoken:
 * the start beep and the stop tone stay tones, because a spoken word arrives
 * late and blurs the moment the clock actually starts.
 */
export function timerCueDelivery(
  setup: Pick<TimerSetup, 'cueMode' | 'spokenPrompts'>,
  cue: 'ready' | 'start' | 'stop' | 'complete',
): TimerCueDelivery {
  const spoken = setup.spokenPrompts && cue === 'ready';
  return resolveTimerCue(setup.cueMode, spoken ? 'voice' : 'beep');
}

/**
 * The auto-stop, in ms, or 0 where it does not apply: it exists to end an
 * open-ended string that the shooter has finished shooting, so a timed series
 * (which ends by itself) and a silent run (no microphone) never use it.
 */
export function autoStopMsFor(setup: TimerSetup): number {
  if (!setup.recordShots || setup.timeLimitSeconds > 0) return 0;
  return Math.round(setup.autoStopSeconds * 1_000);
}
