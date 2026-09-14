import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIME_LIMIT_SETUP,
  MAX_READY_DELAY_SECONDS,
  MAX_REPETITIONS,
  MAX_REST_SECONDS,
  MAX_TIME_LIMIT_SECONDS,
  MIN_TIME_LIMIT_SECONDS,
  buildTimeLimitConfig,
  normalizeTimeLimitSetup,
} from './time-limit';

describe('normalizeTimeLimitSetup', () => {
  it('leaves an in-range setup alone', () => {
    const setup = {
      timeLimitSeconds: 8.5,
      readyDelaySeconds: 2,
      repetitions: 5,
      restSeconds: 10,
    };
    expect(normalizeTimeLimitSetup(setup)).toEqual(setup);
  });

  it('clamps every field to its bounds', () => {
    expect(
      normalizeTimeLimitSetup({
        timeLimitSeconds: 1_000,
        readyDelaySeconds: -1,
        repetitions: 100,
        restSeconds: 1_000,
      }),
    ).toEqual({
      timeLimitSeconds: MAX_TIME_LIMIT_SECONDS,
      readyDelaySeconds: 0,
      repetitions: MAX_REPETITIONS,
      restSeconds: MAX_REST_SECONDS,
    });

    expect(normalizeTimeLimitSetup({ ...DEFAULT_TIME_LIMIT_SETUP, timeLimitSeconds: 0 })).toEqual({
      ...DEFAULT_TIME_LIMIT_SETUP,
      timeLimitSeconds: MIN_TIME_LIMIT_SECONDS,
    });
    expect(
      normalizeTimeLimitSetup({ ...DEFAULT_TIME_LIMIT_SETUP, readyDelaySeconds: 60 })
        .readyDelaySeconds,
    ).toBe(MAX_READY_DELAY_SECONDS);
  });

  it('falls back to the default for a non-finite field', () => {
    expect(
      normalizeTimeLimitSetup({
        timeLimitSeconds: Number.NaN,
        readyDelaySeconds: Number.NaN,
        repetitions: Number.NaN,
        restSeconds: Number.NaN,
      }),
    ).toEqual(DEFAULT_TIME_LIMIT_SETUP);
  });

  it('rounds a fractional repetition count', () => {
    expect(
      normalizeTimeLimitSetup({ ...DEFAULT_TIME_LIMIT_SETUP, repetitions: 3.4 }).repetitions,
    ).toBe(3);
  });
});

describe('buildTimeLimitConfig', () => {
  it('builds one series per repetition, all at the time limit', () => {
    expect(
      buildTimeLimitConfig({
        timeLimitSeconds: 5,
        readyDelaySeconds: 3,
        repetitions: 3,
        restSeconds: 10,
      }),
    ).toEqual({
      readyDelayMs: 3_000,
      series: [
        { index: 0, durationMs: 5_000 },
        { index: 1, durationMs: 5_000 },
        { index: 2, durationMs: 5_000 },
      ],
      restMs: 10_000,
    });
  });

  it('keeps half-second time limits exact', () => {
    expect(
      buildTimeLimitConfig({ ...DEFAULT_TIME_LIMIT_SETUP, timeLimitSeconds: 1.5 }).series[0],
    ).toEqual({ index: 0, durationMs: 1_500 });
  });

  it('is a single series with no rest by default', () => {
    const config = buildTimeLimitConfig(DEFAULT_TIME_LIMIT_SETUP);
    expect(config.series).toHaveLength(1);
    expect(config.restMs).toBe(0);
  });
});
