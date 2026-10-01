import { stopwatchElapsedMs } from './stopwatch';
import {
  clearAllSessionStopwatches,
  getSessionStopwatch,
  lapSessionStopwatch,
  resetSessionStopwatch,
  startSessionStopwatch,
  stopSessionStopwatch,
  subscribeSessionStopwatch,
} from './stopwatch-store';

afterEach(() => clearAllSessionStopwatches());

describe('session stopwatch store', () => {
  it('an untouched session reads as zero and stopped', () => {
    expect(getSessionStopwatch('s1')).toEqual({ startedAt: null, bankedMs: 0, laps: [] });
  });

  it('keeps one clock per session — the point of the store', () => {
    startSessionStopwatch('s1', 1_000);
    expect(stopwatchElapsedMs(getSessionStopwatch('s1'), 6_000)).toBe(5_000);
    expect(stopwatchElapsedMs(getSessionStopwatch('s2'), 6_000)).toBe(0);
  });

  it('survives the screen: a second reader sees the running clock', () => {
    // What broke before — series entry and the session view each had their own.
    startSessionStopwatch('s1', 1_000);
    expect(stopwatchElapsedMs(getSessionStopwatch('s1'), 4_000)).toBe(3_000);
    stopSessionStopwatch('s1', 4_000);
    expect(stopwatchElapsedMs(getSessionStopwatch('s1'), 99_000)).toBe(3_000);
  });

  it('notifies only the subscribers of the session that changed', () => {
    const one = jest.fn();
    const two = jest.fn();
    subscribeSessionStopwatch('s1', one);
    subscribeSessionStopwatch('s2', two);

    startSessionStopwatch('s1', 1_000);
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).not.toHaveBeenCalled();
  });

  it('does not notify when the state is unchanged', () => {
    const listener = jest.fn();
    subscribeSessionStopwatch('s1', listener);
    startSessionStopwatch('s1', 1_000);
    startSessionStopwatch('s1', 5_000); // already running — a stray press
    expect(listener).toHaveBeenCalledTimes(1);
    expect(stopwatchElapsedMs(getSessionStopwatch('s1'), 6_000)).toBe(5_000);
  });

  it('unsubscribing stops delivery', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSessionStopwatch('s1', listener);
    unsubscribe();
    startSessionStopwatch('s1', 1_000);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reset returns to zero and stopped', () => {
    startSessionStopwatch('s1', 1_000);
    stopSessionStopwatch('s1', 4_000);
    resetSessionStopwatch('s1');
    expect(getSessionStopwatch('s1')).toEqual({ startedAt: null, bankedMs: 0, laps: [] });
  });

  it('records laps on the session they were taken on', () => {
    startSessionStopwatch('s1', 1_000);
    lapSessionStopwatch('s1', 3_000);
    lapSessionStopwatch('s2', 3_000); // never started — nothing to lap
    expect(getSessionStopwatch('s1').laps).toEqual([2_000]);
    expect(getSessionStopwatch('s2').laps).toEqual([]);
  });
});
