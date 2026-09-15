// The Time Limit timer's setup: what the four controls span, and the engine
// config they describe. Kept out of the screen (app/src/app/timer.tsx) so the
// clamping is testable, the same split the fälttimer and the shot timer use.
//
// The bounds are slider ends, not engine limits: the engine runs any positive
// duration, these are the values worth dialling in by dragging.
import type { SeriesSpec, TimerConfig } from './types';

/** Half-second granularity: a 1.5 s par time is a real drill, a 1.51 s one is not. */
export const TIME_LIMIT_STEP_SECONDS = 0.5;
export const MIN_TIME_LIMIT_SECONDS = 0.5;
export const MAX_TIME_LIMIT_SECONDS = 60;

/** Past ~15 s a fixed wait stops reading as a start signal. */
export const MAX_READY_DELAY_SECONDS = 15;

export const MIN_REPETITIONS = 1;
export const MAX_REPETITIONS = 20;

export const MAX_REST_SECONDS = 120;

export interface TimeLimitSetup {
  timeLimitSeconds: number;
  readyDelaySeconds: number;
  /** 1 = the plain "beep, shoot, beep" drill; more makes it an interval drill. */
  repetitions: number;
  restSeconds: number;
}

export const DEFAULT_TIME_LIMIT_SETUP: TimeLimitSetup = {
  timeLimitSeconds: 3,
  readyDelaySeconds: 3,
  repetitions: 1,
  restSeconds: 0,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Clamps a setup to the bounds above, rounding the repetition count. */
export function normalizeTimeLimitSetup(setup: TimeLimitSetup): TimeLimitSetup {
  return {
    timeLimitSeconds: clamp(
      setup.timeLimitSeconds,
      MIN_TIME_LIMIT_SECONDS,
      MAX_TIME_LIMIT_SECONDS,
      DEFAULT_TIME_LIMIT_SETUP.timeLimitSeconds,
    ),
    readyDelaySeconds: clamp(
      setup.readyDelaySeconds,
      0,
      MAX_READY_DELAY_SECONDS,
      DEFAULT_TIME_LIMIT_SETUP.readyDelaySeconds,
    ),
    repetitions: Math.round(
      clamp(
        setup.repetitions,
        MIN_REPETITIONS,
        MAX_REPETITIONS,
        DEFAULT_TIME_LIMIT_SETUP.repetitions,
      ),
    ),
    restSeconds: clamp(
      setup.restSeconds,
      0,
      MAX_REST_SECONDS,
      DEFAULT_TIME_LIMIT_SETUP.restSeconds,
    ),
  };
}

export function buildTimeLimitConfig(setup: TimeLimitSetup): TimerConfig {
  const { timeLimitSeconds, readyDelaySeconds, repetitions, restSeconds } =
    normalizeTimeLimitSetup(setup);

  const series: SeriesSpec[] = Array.from({ length: repetitions }, (_, index) => ({
    index,
    durationMs: Math.round(timeLimitSeconds * 1_000),
  }));

  return {
    readyDelayMs: Math.round(readyDelaySeconds * 1_000),
    series,
    restMs: Math.round(restSeconds * 1_000),
  };
}
