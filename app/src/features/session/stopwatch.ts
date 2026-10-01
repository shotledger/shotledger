// The count-up stopwatch's rules, kept out of the component so they can be
// tested without dragging React Native into the test runner (the same split as
// `components/stepper-value.ts`).
//
// Elapsed time is derived from a start timestamp, never accumulated on a tick:
// JS timers are throttled or stopped outright while the app is backgrounded,
// so a counter incremented per tick would drift and stall. The tick only
// decides how often the screen re-reads the clock.

export interface StopwatchState {
  /** Wall-clock ms at which the current run started; `null` when stopped. */
  readonly startedAt: number | null;
  /** Elapsed ms banked by earlier runs, excluding any run in progress. */
  readonly bankedMs: number;
  /** Total elapsed ms at each Lap press, oldest first. */
  readonly laps: readonly number[];
}

export const STOPWATCH_ZERO: StopwatchState = { startedAt: null, bankedMs: 0, laps: [] };

/** Which pair of buttons to show: Lap·Start, Lap·Stop or Reset·Resume. */
export type StopwatchPhase = 'idle' | 'running' | 'stopped';

export function stopwatchPhase(state: StopwatchState): StopwatchPhase {
  if (state.startedAt !== null) return 'running';
  return state.bankedMs > 0 ? 'stopped' : 'idle';
}

/** Elapsed ms at `now`. A clock that went backwards yields the banked time, never less. */
export function stopwatchElapsedMs(state: StopwatchState, now: number): number {
  const running = state.startedAt === null ? 0 : now - state.startedAt;
  return Math.max(0, state.bankedMs + Math.max(0, running));
}

/** Start, or keep running unchanged so a stray press cannot restart the clock. */
export function startStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.startedAt !== null) return state;
  return { ...state, startedAt: now };
}

/** Stop, banking the run in progress. */
export function stopStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.startedAt === null) return state;
  return { ...state, startedAt: null, bankedMs: stopwatchElapsedMs(state, now) };
}

/** Record a lap at `now`. Only while running — a stopped clock has no lap to close. */
export function lapStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.startedAt === null) return state;
  return { ...state, laps: [...state.laps, stopwatchElapsedMs(state, now)] };
}

export interface StopwatchLap {
  /** 1-based, in the order the laps were taken. */
  readonly number: number;
  /** Duration of this lap alone, not the running total. */
  readonly ms: number;
}

/** Recorded laps as durations, newest first — the order a phone stopwatch lists them. */
export function stopwatchLaps(state: StopwatchState): StopwatchLap[] {
  return state.laps
    .map((at, i) => ({ number: i + 1, ms: at - (i === 0 ? 0 : state.laps[i - 1]) }))
    .reverse();
}

/** Back to 00:00, stopped, no laps. */
export function resetStopwatch(): StopwatchState {
  return STOPWATCH_ZERO;
}

/**
 * `MM:SS`, seconds truncated. Past 59:59 the minutes keep counting into three
 * digits (60:00, 100:00) rather than wrapping to an unshown hours field — the
 * shooter asked for MM:SS, and a display that silently restarts at 00:00 would
 * be worse than a wider one for a session that ran long.
 */
export function formatStopwatch(elapsedMs: number): string {
  const safeMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const totalSeconds = Math.floor(safeMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
