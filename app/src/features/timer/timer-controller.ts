// Drives a `TimerEngine` (shared/src/timer) off a wall clock, turns its cue
// events into effect calls (sound/voice/vibration), and — when the setup asks
// for it — runs a `ShotDetector` over the microphone windows the host feeds
// in. Plain TS, no RN/React imports: `use-timer.ts` is a thin
// `useState`/`setInterval` wrapper around this, and this is what the tests
// drive.
//
// One controller for both timers (#346). Shot detection is an option on any
// drill here, not a second machine: the detector is armed on each series'
// start cue and read out on its stop cue, so a PAR drill, an interval drill
// and an open-ended IPSC string all record splits the same way.
import {
  ShotDetector,
  TimerEngine,
  autoStopMsFor,
  buildTimerConfig,
  normalizeTimerSetup,
  shotGateFor,
  timerCueDelivery,
  type DetectedShot,
  type LevelWindow,
  type ShotRunSummary,
  type TimerConfig,
  type TimerCueKind,
  type TimerEvent,
  type TimerPhase,
  type TimerSetup,
} from '@shotledger/shared';

export interface TimerEffects {
  playSound: (kind: TimerCueKind) => void;
  vibrate: () => void;
  /** Speaks the ready prompt; false when nothing was spoken, so the tone can stand in. */
  speak?: () => boolean;
}

/** One finished series' shots, kept once the next one has armed over them. */
export interface SeriesResult {
  seriesIndex: number;
  shots: readonly DetectedShot[];
  summary: ShotRunSummary;
}

export class TimerController {
  private readonly setup: TimerSetup;
  private readonly config: TimerConfig;
  private readonly engine: TimerEngine;
  private readonly effects: TimerEffects;
  private readonly detector: ShotDetector | null;
  private readonly autoStopMs: number;

  private lastTickAtMs: number | null = null;
  private results: SeriesResult[] = [];
  /** Where the audio sample clock stood at the last tick — what a shot is timed from. */
  private streamMs = 0;

  constructor(setup: TimerSetup, effects: TimerEffects) {
    this.setup = normalizeTimerSetup(setup);
    this.config = buildTimerConfig(this.setup);
    this.engine = new TimerEngine(this.config);
    this.effects = effects;
    const gate = shotGateFor(this.setup);
    this.detector = gate === null ? null : new ShotDetector(gate);
    this.autoStopMs = autoStopMsFor(this.setup);
  }

  /** Starts the drill at wall-clock time `nowMs` and applies effects for the initial ready cue. */
  start(nowMs: number): TimerPhase {
    this.lastTickAtMs = nowMs;
    this.results = [];
    this.applyEvents(this.engine.start());
    return this.engine.getPhase();
  }

  /**
   * Advances the engine to wall-clock time `nowMs`, applying effects for
   * every cue crossed, and ends an open-ended series that has fallen silent
   * for longer than the auto-stop. No-op before `start()`/after `reset()`.
   *
   * `streamMs` is where the audio sample clock stands now, projected by the
   * host from the last window it received; it is what a shot is timed
   * against, because a window knows its own capture time while a beep only
   * knows the wall clock.
   */
  tick(nowMs: number, streamMs = 0): TimerPhase {
    if (this.lastTickAtMs === null) return this.engine.getPhase();
    const deltaMs = Math.max(0, nowMs - this.lastTickAtMs);
    this.lastTickAtMs = nowMs;
    this.streamMs = streamMs;
    this.applyEvents(this.engine.advance(deltaMs));

    if (this.shouldAutoStop()) this.applyEvents(this.engine.stopSeries());
    return this.engine.getPhase();
  }

  /** Ends the running series by hand — the Stop button under an open-ended string. */
  stopSeries(): TimerPhase {
    this.applyEvents(this.engine.stopSeries());
    return this.engine.getPhase();
  }

  reset(): TimerPhase {
    this.lastTickAtMs = null;
    this.engine.reset();
    this.detector?.reset();
    this.results = [];
    return this.engine.getPhase();
  }

  getPhase(): TimerPhase {
    return this.engine.getPhase();
  }

  getElapsedMs(): number {
    return this.engine.getElapsedMs();
  }

  getConfig(): TimerConfig {
    return this.config;
  }

  isRunning(): boolean {
    const kind = this.engine.getPhase().kind;
    return kind !== 'idle' && kind !== 'done';
  }

  /** True when this drill is listening at all — the screen shows shots only then. */
  isRecordingShots(): boolean {
    return this.detector !== null;
  }

  /**
   * Feeds one window of microphone level. Windows from before the start cue
   * are still worth pushing: they train the noise floor, and the detector's
   * own arming is what stops them becoming shots.
   */
  pushWindow(window: LevelWindow): DetectedShot | null {
    return this.detector?.push(window) ?? null;
  }

  /** The running series' shots so far. */
  getShots(): readonly DetectedShot[] {
    return this.detector?.getShots() ?? [];
  }

  /** Every series that has finished, in order. */
  getResults(): readonly SeriesResult[] {
    return this.results;
  }

  getNoiseFloorDb(): number | null {
    return this.detector?.getNoiseFloorDb() ?? null;
  }

  /**
   * Silence ends an open-ended string, and only that: a timed series ends on
   * its own clock, and with no microphone there is no silence to measure
   * (`autoStopMsFor`). Measured from the last shot, or from the start signal
   * when nothing has been fired.
   */
  private shouldAutoStop(): boolean {
    if (this.detector === null || this.autoStopMs <= 0) return false;
    const phase = this.engine.getPhase();
    if (phase.kind !== 'series' || !phase.openEnded) return false;
    return this.detector.silenceMsAt(phase.elapsedMs) >= this.autoStopMs;
  }

  // `event.cue.vibrate` is the engine's own suggestion; the shooter's chosen
  // mode overrides it in both directions (#138).
  private applyEvents(events: readonly TimerEvent[]): void {
    for (const event of events) {
      const { sound, vibrate } = timerCueDelivery(this.setup, cueOf(event));
      if (sound === 'voice') {
        // A refused utterance falls back to the tone rather than to silence.
        if (this.effects.speak?.() !== true) this.effects.playSound(event.cue.kind);
      } else if (sound !== null) {
        this.effects.playSound(event.cue.kind);
      }
      if (vibrate) this.effects.vibrate();
      this.recordSeriesBoundary(event);
    }
  }

  /** Arms the detector on a start cue and reads it out on the matching stop. */
  private recordSeriesBoundary(event: TimerEvent): void {
    const detector = this.detector;
    if (!detector) return;
    if (event.cue.kind === 'start') {
      detector.rearm(this.streamMs);
      return;
    }
    if (event.cue.kind !== 'stop') return;
    this.results.push({
      seriesIndex: event.cue.seriesIndex,
      shots: [...detector.getShots()],
      summary: detector.getSummary(),
    });
  }
}

/** The cue kinds the delivery rules know; `whistle` is the fälttimer's alone. */
function cueOf(event: TimerEvent): 'ready' | 'start' | 'stop' | 'complete' {
  return event.cue.kind === 'whistle' ? 'stop' : event.cue.kind;
}
