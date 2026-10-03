// Shot timer engine — pure state machine, no RN/audio imports (executable
// spec: docs/specs/shot-timer-spec.md). The engine emits cues as DATA
// (`TimerCue`); the app layer maps those to expo-audio/Vibration calls.

/** One series in a drill: PAR mode has exactly one, interval mode many. */
export interface SeriesSpec {
  /** 0-based position in `TimerConfig.series`. */
  index: number;
  /**
   * null runs the series open-ended: it ends when the host calls
   * `stopSeries()` — a manual stop, or the auto-stop after a stretch of
   * silence when shot detection is recording. That is the shape an IPSC-style
   * string has, and it is why this engine can host one (#346).
   */
  durationMs: number | null;
  /** Optional label for UI/i18n interpolation, e.g. "1" or "10". Not used by the engine itself. */
  label?: string;
}

export interface RandomDelayRange {
  minMs: number;
  maxMs: number;
}

export interface TimerConfig {
  /**
   * Ready delay before EVERY series' start signal (re-drawn per series when
   * `randomReadyDelay` is set, so a shooter cannot anticipate the beep on
   * later reps either). Ignored when `randomReadyDelay` is present.
   */
  readyDelayMs: number;
  /** When set, overrides `readyDelayMs`: each ready delay is drawn uniformly from [minMs, maxMs] via the injected RNG. */
  randomReadyDelay?: RandomDelayRange;
  series: readonly SeriesSpec[];
  /** Rest between one series' stop signal and the next series' ready delay. Ignored before the first series. */
  restMs: number;
}

export type TimerPhaseKind = 'idle' | 'readyDelay' | 'series' | 'rest' | 'done';

export interface TimerPhase {
  kind: TimerPhaseKind;
  /** True while an open-ended series is running: `remainingMs` means nothing, `elapsedMs` is the clock. */
  openEnded: boolean;
  /** -1 outside readyDelay/series/rest. */
  seriesIndex: number;
  /** ms remaining in the current phase; 0 for idle/done. */
  remainingMs: number;
  /** ms elapsed in the current phase; 0 for idle/done. */
  elapsedMs: number;
}

/**
 * `whistle` is the drawn-out ELD UPPHÖR blast, not a beep: SHB D.6.2 lets the
 * spoken command be replaced by a visselsignal, and the call runs for the
 * full ELD_UPPHOR_LEAD_SECONDS. The other four are short cues.
 */
export type TimerCueKind = 'ready' | 'start' | 'stop' | 'complete' | 'whistle';

/** A cue the engine wants played, as data — never a direct audio/vibration call. */
export interface TimerCue {
  kind: TimerCueKind;
  seriesIndex: number;
  /** Whether the host should vibrate for this cue (start/stop/complete: yes; ready: no — it is a silent phase boundary). */
  vibrate: boolean;
}

/** One state transition, timestamped on the engine's own clock. */
export interface TimerEvent {
  atMs: number;
  cue: TimerCue;
  phase: TimerPhase;
}

/** Injected clock/RNG so the engine is fully deterministic under test. */
export interface TimerEngineDeps {
  /** Uniform [0, 1). Defaults to `Math.random`. Only consulted when `randomReadyDelay` is set. */
  random?: () => number;
}
