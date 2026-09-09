import {
  formatStopwatch,
  resetStopwatch,
  startStopwatch,
  stopStopwatch,
  stopwatchElapsedMs,
  STOPWATCH_ZERO,
} from './stopwatch';

const T0 = 1_757_500_000_000;

describe('formatStopwatch', () => {
  it('shows zero as 00:00', () => {
    expect(formatStopwatch(0)).toBe('00:00');
  });

  it('truncates rather than rounds within a second', () => {
    expect(formatStopwatch(999)).toBe('00:00');
    expect(formatStopwatch(1_000)).toBe('00:01');
    expect(formatStopwatch(1_999)).toBe('00:01');
  });

  it('zero-pads sub-minute seconds', () => {
    expect(formatStopwatch(9_000)).toBe('00:09');
    expect(formatStopwatch(59_000)).toBe('00:59');
  });

  it('rolls over into minutes', () => {
    expect(formatStopwatch(60_000)).toBe('01:00');
    expect(formatStopwatch(61_000)).toBe('01:01');
    expect(formatStopwatch(599_000)).toBe('09:59');
    expect(formatStopwatch(600_000)).toBe('10:00');
  });

  it('keeps counting minutes past 59:59 instead of wrapping', () => {
    expect(formatStopwatch(3_599_000)).toBe('59:59');
    expect(formatStopwatch(3_600_000)).toBe('60:00');
    expect(formatStopwatch(3_661_000)).toBe('61:01');
    expect(formatStopwatch(6_000_000)).toBe('100:00');
  });

  it('never shows a negative or non-numeric time', () => {
    expect(formatStopwatch(-1)).toBe('00:00');
    expect(formatStopwatch(Number.NaN)).toBe('00:00');
    expect(formatStopwatch(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});

describe('stopwatchElapsedMs', () => {
  it('is zero before the first start', () => {
    expect(stopwatchElapsedMs(STOPWATCH_ZERO, T0)).toBe(0);
  });

  it('is derived from the start timestamp, so a gap in ticks loses no time', () => {
    const running = startStopwatch(STOPWATCH_ZERO, T0);
    // One tick, then 90 s with no ticks at all (backgrounded), then one more.
    expect(stopwatchElapsedMs(running, T0 + 250)).toBe(250);
    expect(stopwatchElapsedMs(running, T0 + 90_250)).toBe(90_250);
    expect(formatStopwatch(stopwatchElapsedMs(running, T0 + 90_250))).toBe('01:30');
  });

  it('freezes while stopped, however long the screen stays open', () => {
    const stopped = stopStopwatch(startStopwatch(STOPWATCH_ZERO, T0), T0 + 5_000);
    expect(stopwatchElapsedMs(stopped, T0 + 5_000)).toBe(5_000);
    expect(stopwatchElapsedMs(stopped, T0 + 900_000)).toBe(5_000);
  });

  it('never goes backwards if the wall clock does', () => {
    const running = startStopwatch(STOPWATCH_ZERO, T0);
    expect(stopwatchElapsedMs(running, T0 - 10_000)).toBe(0);
  });
});

describe('start/stop/reset', () => {
  it('banks each run and resumes from the banked total', () => {
    const first = stopStopwatch(startStopwatch(STOPWATCH_ZERO, T0), T0 + 30_000);
    expect(first.bankedMs).toBe(30_000);

    const second = startStopwatch(first, T0 + 100_000);
    expect(stopwatchElapsedMs(second, T0 + 105_000)).toBe(35_000);
    expect(formatStopwatch(stopwatchElapsedMs(second, T0 + 105_000))).toBe('00:35');
  });

  it('ignores a start while running, so a stray press cannot restart the clock', () => {
    const running = startStopwatch(STOPWATCH_ZERO, T0);
    expect(startStopwatch(running, T0 + 5_000)).toBe(running);
  });

  it('ignores a stop while stopped', () => {
    expect(stopStopwatch(STOPWATCH_ZERO, T0)).toBe(STOPWATCH_ZERO);
  });

  it('resets to zero and stopped, from running or stopped', () => {
    expect(resetStopwatch()).toEqual({ startedAt: null, bankedMs: 0 });
    expect(stopwatchElapsedMs(resetStopwatch(), T0 + 999_999)).toBe(0);
    expect(formatStopwatch(stopwatchElapsedMs(resetStopwatch(), T0))).toBe('00:00');
  });
});
