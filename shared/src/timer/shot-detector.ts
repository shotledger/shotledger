// IPSC-style shot timer: pure shot detection + run state machine. No
// RN/audio imports — the app layer feeds windows of microphone level in
// (see pcm.ts) and maps the emitted cues to sound.
//
// WHY THIS IS NOT A THRESHOLD ANY MORE (#346). The detector used to fire on
// one metering sample crossing a fixed dBFS level. That cannot work indoors:
// Android applies automatic gain control to the microphone, so a finger snap
// is lifted to full scale and a shot is squashed toward it — at 0 dBFS, the
// least sensitive setting the old control offered, a snap still pinned the
// meter. There is no headroom left to tune into.
//
// So the gate is three measurements over a ~10 ms window stream, none of
// which is an absolute level:
//
//   excess    how far the window rose above a tracked noise floor. AGC moves
//             the floor and the event together, so their distance survives it
//             where an absolute dBFS number does not.
//   rise      how abruptly it got there. A muzzle blast reaches its peak
//             within a window or two; a door swinging, a voice or a car does
//             not.
//   duration  how long the event stayed up. This is the discriminator
//             commercial detectors gate on, and the one a bare threshold has
//             no way to express.
//
// What it does NOT do, and cannot: separate a shot from another impulse of
// the same shape. A finger snap is a short, abrupt, loud event — by these
// three measurements it *is* a shot. Telling those apart needs a classifier
// or a calibration step, and neither is this.

import type { LevelWindow } from './pcm';

/** Microphone sensitivity. Higher sensitivity accepts weaker and longer events. */
export type ShotSensitivity = 'low' | 'medium' | 'high';

/** The three numbers one sensitivity preset sets. See the gate description above. */
export interface ShotGateSettings {
  /** dB above the tracked noise floor a window must reach to open an event. */
  triggerExcessDb: number;
  /** Longest event still accepted as a shot, in ms. */
  maxEventMs: number;
}

/**
 * Starting points, not measured constants: the shooter adjusts the excess on
 * the setup screen with the live meter in front of them.
 *
 * `maxEventMs` runs the other way round from the figure quoted in #346's
 * research ("25–80 ms, shorter = more sensitive"): those units gate on a
 * *minimum* event length, ours on a maximum, so a wider window is the more
 * permissive end here.
 */
export const SENSITIVITY_PRESETS: Record<ShotSensitivity, ShotGateSettings> = {
  low: { triggerExcessDb: 18, maxEventMs: 25 },
  medium: { triggerExcessDb: 12, maxEventMs: 50 },
  high: { triggerExcessDb: 8, maxEventMs: 80 },
};

/** Valid range for the user-set trigger excess, in dB over the noise floor. */
export const MIN_TRIGGER_EXCESS_DB = 4;
export const MAX_TRIGGER_EXCESS_DB = 30;

/** Step size the setup screen's excess slider moves by. */
export const TRIGGER_EXCESS_STEP_DB = 1;

/** Bounds on the event-length gate the presets pick from. */
export const MIN_EVENT_MS = 10;
export const MAX_EVENT_MS = 400;

/**
 * How far the level must fall back toward the floor before the event is
 * considered over. Lower than the trigger on purpose: without hysteresis the
 * ragged decay of one blast closes and reopens the event several times, and
 * each reopening looks like another shot.
 */
export const RELEASE_EXCESS_DB = 4;

/**
 * Minimum jump between two consecutive windows for the event to count as an
 * impulse. Measured against the previous window, so at a 10 ms hop this is
 * "reached 8 dB of its rise in 10 ms" — true of a muzzle blast, false of
 * anything that swells.
 */
export const DEFAULT_MIN_RISE_DB = 8;

/** Default debounce between two shots; below this a second peak is the same shot's tail. */
export const DEFAULT_MIN_SHOT_GAP_MS = 80;

/**
 * How the noise floor follows the level, per ~10 ms window. Asymmetric: it
 * rises slowly so a blast barely moves it and falls quickly so it settles
 * onto a quiet range. These are the mic-diagnostics rates (which are per
 * 60 ms sample) scaled to the window hop, so a recording made on the
 * diagnostics screen still describes this detector's floor.
 */
export interface NoiseFloorRates {
  riseRate: number;
  fallRate: number;
  initialDb: number;
}

export const DEFAULT_WINDOW_NOISE_FLOOR: NoiseFloorRates = {
  riseRate: 0.0007,
  fallRate: 0.013,
  initialDb: -60,
};

export interface ShotDetectorOptions {
  sensitivity?: ShotSensitivity;
  /** Overrides the preset's trigger excess when set. */
  triggerExcessDb?: number;
  /** Overrides the preset's event-length gate when set. */
  maxEventMs?: number;
  minRiseDb?: number;
  minGapMs?: number;
  noiseFloor?: Partial<NoiseFloorRates>;
}

export interface DetectedShot {
  /** 0-based order in the string. */
  index: number;
  /** ms after the start beep, at the event's onset (not where it was confirmed). */
  atMs: number;
  /** ms since the previous shot; equals `atMs` for the first shot. */
  splitMs: number;
  /** How long the accepted impulse lasted, in ms. */
  durationMs: number;
  /** How far its peak stood above the noise floor, in dB. */
  excessDb: number;
}

export interface ShotRunSummary {
  shotCount: number;
  /** ms to the first shot, or undefined with no shots. */
  firstShotMs?: number;
  /** ms to the last shot ("total time"), or undefined with no shots. */
  totalMs?: number;
  /** Split before each shot, in shot order (`splits[0]` is the first-shot time). */
  splits: readonly number[];
  /** Longest split, or undefined with fewer than two shots. */
  slowestSplitMs?: number;
  /** ms by which `totalMs` exceeded the PAR time; undefined when no PAR is set or it was met. */
  parOverrunMs?: number;
}

/** An event that opened but was not accepted, and the measurement that rejected it. */
export type RejectionReason = 'tooLong' | 'tooSlowRise' | 'tooSoon';

/** The event currently being measured. */
interface OpenEvent {
  startedAtMs: number;
  lastAboveMs: number;
  peakDb: number;
  peakExcessDb: number;
  riseDb: number;
}

/**
 * Detects shots in a stream of level windows. Windows pushed before `arm()`
 * (i.e. before the start beep) still train the noise floor but cannot
 * produce a shot, so a shooter who fires early does not get a phantom shot 0
 * and the floor is already settled when the beep comes.
 *
 * A shot is reported when its event *closes*, which is up to `maxEventMs`
 * after it began — but it is timestamped at its onset, so the split is the
 * moment of the blast and not the moment the gate finished deciding.
 *
 * @Requirements TIMER_001
 */
export class ShotDetector {
  private readonly triggerExcessDb: number;
  private readonly maxEventMs: number;
  private readonly minRiseDb: number;
  private readonly minGapMs: number;
  private readonly rates: NoiseFloorRates;

  /** Null until the first window seeds it — see `trackFloor`. */
  private floorDb: number | null = null;
  private previousDb: number | null = null;
  /** Stream time of the start beep; null before `arm()`. */
  private armedAtMs: number | null = null;
  /** Stream time of the last accepted shot. */
  private lastShotAtMs: number | null = null;
  private shots: DetectedShot[] = [];
  private open: OpenEvent | null = null;
  /** Set when an event was closed while still loud — see `push`. */
  private holdingOff = false;
  private lastRejection: RejectionReason | null = null;

  constructor(options: ShotDetectorOptions = {}) {
    const preset = SENSITIVITY_PRESETS[options.sensitivity ?? 'medium'];
    const excess = options.triggerExcessDb ?? preset.triggerExcessDb;
    if (
      !Number.isFinite(excess) ||
      excess < MIN_TRIGGER_EXCESS_DB ||
      excess > MAX_TRIGGER_EXCESS_DB
    ) {
      throw new Error(
        `triggerExcessDb must be between ${MIN_TRIGGER_EXCESS_DB} and ${MAX_TRIGGER_EXCESS_DB}`,
      );
    }
    const maxEvent = options.maxEventMs ?? preset.maxEventMs;
    if (!Number.isFinite(maxEvent) || maxEvent < MIN_EVENT_MS || maxEvent > MAX_EVENT_MS) {
      throw new Error(`maxEventMs must be between ${MIN_EVENT_MS} and ${MAX_EVENT_MS}`);
    }
    const rise = options.minRiseDb ?? DEFAULT_MIN_RISE_DB;
    if (!Number.isFinite(rise) || rise < 0) throw new Error('minRiseDb must be >= 0');
    const gap = options.minGapMs ?? DEFAULT_MIN_SHOT_GAP_MS;
    if (!Number.isFinite(gap) || gap < 0) throw new Error('minGapMs must be >= 0');

    this.triggerExcessDb = excess;
    this.maxEventMs = maxEvent;
    this.minRiseDb = rise;
    this.minGapMs = gap;
    this.rates = { ...DEFAULT_WINDOW_NOISE_FLOOR, ...options.noiseFloor };
  }

  getTriggerExcessDb(): number {
    return this.triggerExcessDb;
  }

  getMaxEventMs(): number {
    return this.maxEventMs;
  }

  /** The tracked noise floor, in dBFS — what the setup meter draws its trigger line from. */
  getNoiseFloorDb(): number {
    return this.floorDb ?? this.rates.initialDb;
  }

  /** Why the last event that opened was not counted, or null if one was. */
  getLastRejection(): RejectionReason | null {
    return this.lastRejection;
  }

  /**
   * Starts accepting shots, anchoring the run clock to the start beep.
   *
   * `atStreamMs` is the beep's position on the audio sample clock the
   * windows are timed against, not a run-relative 0 — that is the whole
   * point of it. Shots are reported relative to this moment.
   */
  arm(atStreamMs = 0): void {
    this.armedAtMs = atStreamMs;
  }

  isArmed(): boolean {
    return this.armedAtMs !== null;
  }

  /**
   * Feeds one level window; returns the shot it completed, or null. A shot
   * is returned on the window that *closes* a qualifying event, so it can
   * arrive a few windows after the blast itself — `atMs` says when the blast
   * was.
   */
  push(window: LevelWindow): DetectedShot | null {
    const { atMs, db } = window;
    if (!Number.isFinite(db) || !Number.isFinite(atMs) || atMs < 0) return null;

    // The first window *sets* the floor rather than being followed toward
    // it. Rising from the nominal −60 dBFS to a real room at the documented
    // rate takes some fifteen seconds, and a run that started cold would
    // spend all of it firing on the room itself.
    if (this.floorDb === null) this.floorDb = db;

    const excessDb = db - this.floorDb;
    const previousDb = this.previousDb;
    this.previousDb = db;

    // The floor is frozen while an event is open: a long loud one would
    // otherwise drag the floor up under itself and close its own event.
    if (this.open === null && !this.holdingOff) this.trackFloor(db);

    // A sound that outran the gate is closed the moment that is certain,
    // while it is still going. Without this it would immediately reopen as a
    // fresh event and be rejected again every `maxEventMs` for as long as it
    // lasted; the rejection that matters is the first one.
    if (this.holdingOff) {
      if (excessDb < RELEASE_EXCESS_DB) this.holdingOff = false;
      return null;
    }

    if (this.open === null) {
      if (excessDb >= this.triggerExcessDb) {
        this.open = {
          startedAtMs: atMs,
          lastAboveMs: atMs,
          peakDb: db,
          peakExcessDb: excessDb,
          riseDb: previousDb === null ? excessDb : db - previousDb,
        };
      }
      return null;
    }

    if (db > this.open.peakDb) {
      this.open.peakDb = db;
      this.open.peakExcessDb = excessDb;
    }
    if (excessDb >= RELEASE_EXCESS_DB) this.open.lastAboveMs = atMs;

    // An event that has already outrun the gate is not a shot however it
    // ends, so it is closed as soon as that is certain rather than held open
    // until it falls — the shot after it must not be swallowed by a door
    // still swinging.
    const outrun = this.open.lastAboveMs - this.open.startedAtMs > this.maxEventMs;
    if (!outrun && excessDb >= RELEASE_EXCESS_DB) return null;

    const event = this.open;
    this.open = null;
    this.holdingOff = outrun;
    // The floor missed every window the event covered; hand it the level it
    // ended on so it is current again rather than stale by the event length.
    if (!outrun) this.trackFloor(db);
    return this.closeEvent(event);
  }

  /** Applies the gate to a finished event and records it when it passes. */
  private closeEvent(event: OpenEvent): DetectedShot | null {
    const durationMs = event.lastAboveMs - event.startedAtMs;
    if (durationMs > this.maxEventMs) {
      this.lastRejection = 'tooLong';
      return null;
    }
    if (event.riseDb < this.minRiseDb) {
      this.lastRejection = 'tooSlowRise';
      return null;
    }
    if (this.armedAtMs === null) return null;
    if (this.lastShotAtMs !== null && event.startedAtMs - this.lastShotAtMs < this.minGapMs) {
      this.lastRejection = 'tooSoon';
      return null;
    }

    const runAtMs = event.startedAtMs - this.armedAtMs;
    // A shot fired between the beep and the first window after it would land
    // fractionally before zero; the run cannot start before it starts.
    const atMs = Math.max(0, runAtMs);
    const splitMs = this.lastShotAtMs === null ? atMs : event.startedAtMs - this.lastShotAtMs;
    const shot: DetectedShot = {
      index: this.shots.length,
      atMs,
      splitMs,
      durationMs,
      excessDb: event.peakExcessDb,
    };
    this.shots.push(shot);
    this.lastShotAtMs = event.startedAtMs;
    this.lastRejection = null;
    return shot;
  }

  /** Exponential follower with separate up/down rates — see NoiseFloorRates. */
  private trackFloor(db: number): void {
    const floorDb = this.floorDb ?? db;
    const rate = db > floorDb ? this.rates.riseRate : this.rates.fallRate;
    this.floorDb = floorDb + rate * (db - floorDb);
  }

  getShots(): readonly DetectedShot[] {
    return this.shots;
  }

  /** ms since the last shot (or since the beep with no shots yet) at run time `nowMs`. */
  silenceMsAt(nowMs: number): number {
    const lastShotRunMs =
      this.lastShotAtMs === null || this.armedAtMs === null
        ? 0
        : this.lastShotAtMs - this.armedAtMs;
    return nowMs - lastShotRunMs;
  }

  getSummary(parMs?: number): ShotRunSummary {
    const splits = this.shots.map((shot) => shot.splitMs);
    const first = this.shots[0];
    const last = this.shots[this.shots.length - 1];
    const overrun = parMs !== undefined && last !== undefined ? last.atMs - parMs : undefined;
    return {
      shotCount: this.shots.length,
      firstShotMs: first?.atMs,
      totalMs: last?.atMs,
      splits,
      slowestSplitMs: splits.length > 1 ? Math.max(...splits.slice(1)) : undefined,
      parOverrunMs: overrun !== undefined && overrun > 0 ? overrun : undefined,
    };
  }

  /** Back to pre-beep, keeping nothing — including the learned noise floor. */
  reset(): void {
    this.armedAtMs = null;
    this.lastShotAtMs = null;
    this.shots = [];
    this.open = null;
    this.holdingOff = false;
    this.previousDb = null;
    this.lastRejection = null;
    this.floorDb = null;
  }
}

export type IpscPhaseKind = 'idle' | 'ready' | 'standby' | 'running' | 'done';

/** Cues the run emits as data; the app layer turns them into sound. */
export type IpscCueKind = 'ready' | 'standby' | 'start' | 'stop';

export interface IpscPhase {
  kind: IpscPhaseKind;
  /** ms left in `ready`/`standby`; 0 elsewhere. */
  remainingMs: number;
  /** ms since the start beep; 0 before it. */
  runElapsedMs: number;
}

export interface IpscTimerConfig {
  /** "Are you ready?" prompt duration. */
  readyMs: number;
  /** "Standby" is held for a random delay drawn from this range, then the beep fires. */
  randomDelay: { minMs: number; maxMs: number };
  /** Optional PAR time; reported as an overrun in the summary, never stops the run. */
  parMs?: number;
  /** Auto-stop after this much silence (from the beep, or the last shot). 0/undefined = manual stop only. */
  autoStopSilenceMs?: number;
  sensitivity?: ShotSensitivity;
  /** Overrides the preset's trigger excess over the noise floor, in dB. */
  triggerExcessDb?: number;
  /** Overrides the preset's event-length gate, in ms. */
  maxEventMs?: number;
  minGapMs?: number;
}

export const DEFAULT_IPSC_CONFIG: IpscTimerConfig = {
  readyMs: 1_500,
  randomDelay: { minMs: 1_000, maxMs: 4_000 },
  autoStopSilenceMs: 10_000,
  sensitivity: 'medium',
};

export interface IpscTimerDeps {
  /** Uniform [0, 1). Injected so the random delay is deterministic under test. */
  random?: () => number;
}

/**
 * The run: idle → ready ("Are you ready?") → standby (random delay) → beep →
 * running (listening) → done. Time only moves through `advance(deltaMs)`, so
 * the host owns the clock and tests are deterministic.
 */
export class IpscTimerEngine {
  private readonly config: IpscTimerConfig;
  private readonly random: () => number;
  private detector: ShotDetector;

  private kind: IpscPhaseKind = 'idle';
  private remainingMs = 0;
  private runElapsedMs = 0;

  constructor(config: IpscTimerConfig = DEFAULT_IPSC_CONFIG, deps: IpscTimerDeps = {}) {
    validateIpscConfig(config);
    this.config = config;
    this.random = deps.random ?? Math.random;
    this.detector = this.newDetector();
  }

  private newDetector(): ShotDetector {
    return new ShotDetector({
      sensitivity: this.config.sensitivity,
      triggerExcessDb: this.config.triggerExcessDb,
      maxEventMs: this.config.maxEventMs,
      minGapMs: this.config.minGapMs,
    });
  }

  /** idle → ready. Throws if a run is already in progress. */
  start(): readonly IpscCueKind[] {
    if (this.kind !== 'idle' && this.kind !== 'done') {
      throw new Error('IpscTimerEngine.start() called mid-run');
    }
    this.detector = this.newDetector();
    this.runElapsedMs = 0;
    this.kind = 'ready';
    this.remainingMs = this.config.readyMs;
    return ['ready'];
  }

  /**
   * Advances the clock, returning cues crossed in order.
   *
   * `streamMs` is where the audio sample clock stands *now*, and is what the
   * detector anchors the run to when this call crosses into `running`. The
   * host projects it from the last window it received plus the wall time
   * since; passing nothing anchors the run at 0, which is only right when
   * the windows are fed in run time too (the tests).
   */
  advance(deltaMs: number, streamMs = 0): readonly IpscCueKind[] {
    if (!Number.isFinite(deltaMs) || deltaMs < 0)
      throw new Error('advance() requires deltaMs >= 0');
    const cues: IpscCueKind[] = [];
    let remaining = deltaMs;

    // Each iteration either consumes the whole delta or leaves a countdown
    // phase for the next one; `running`/`done` end the loop, so it is bounded.
    while (remaining > 0) {
      if (this.kind === 'idle' || this.kind === 'done') break;

      if (this.kind === 'running') {
        this.runElapsedMs += remaining;
        const silenceLimit = this.config.autoStopSilenceMs ?? 0;
        if (silenceLimit > 0 && this.detector.silenceMsAt(this.runElapsedMs) >= silenceLimit) {
          cues.push(...this.stop());
        }
        break;
      }

      if (remaining < this.remainingMs) {
        this.remainingMs -= remaining;
        break;
      }

      remaining -= this.remainingMs;
      this.remainingMs = 0;
      cues.push(...this.enterNextCountdownPhase(streamMs - remaining));
    }

    return cues;
  }

  /** `beepStreamMs` is where the beep falls on the sample clock (see `advance`). */
  private enterNextCountdownPhase(beepStreamMs: number): readonly IpscCueKind[] {
    if (this.kind === 'ready') {
      this.kind = 'standby';
      const { minMs, maxMs } = this.config.randomDelay;
      this.remainingMs = minMs + this.random() * (maxMs - minMs);
      return ['standby'];
    }
    // 'standby' → the beep.
    this.kind = 'running';
    this.remainingMs = 0;
    this.runElapsedMs = 0;
    this.detector.arm(beepStreamMs);
    return ['start'];
  }

  /**
   * Feeds one level window. `atMs` is run-relative (0 = the start beep) and
   * comes from the audio sample clock, not from `advance()` — the buffer
   * carrying a window reaches JS up to 100 ms late, while the window itself
   * knows exactly when it was.
   *
   * Windows from before the beep are still fed in: they train the noise
   * floor, and `arm()` is what stops them becoming shots.
   */
  pushWindow(window: LevelWindow): DetectedShot | null {
    if (this.kind !== 'running' && this.kind !== 'ready' && this.kind !== 'standby') return null;
    return this.detector.push(window);
  }

  /** The tracked noise floor, for the setup meter's trigger line. */
  getNoiseFloorDb(): number {
    return this.detector.getNoiseFloorDb();
  }

  /** Manual (or auto) stop: running → done. No-op in any other phase. */
  stop(): readonly IpscCueKind[] {
    if (this.kind !== 'running') return [];
    this.kind = 'done';
    return ['stop'];
  }

  /** Back to idle, discarding the run. */
  reset(): void {
    this.kind = 'idle';
    this.remainingMs = 0;
    this.runElapsedMs = 0;
    this.detector.reset();
  }

  getPhase(): IpscPhase {
    return {
      kind: this.kind,
      remainingMs: Math.max(0, this.remainingMs),
      runElapsedMs: this.runElapsedMs,
    };
  }

  getShots(): readonly DetectedShot[] {
    return this.detector.getShots();
  }

  getSummary(): ShotRunSummary {
    return this.detector.getSummary(this.config.parMs);
  }
}

function validateIpscConfig(config: IpscTimerConfig): void {
  if (!Number.isFinite(config.readyMs) || config.readyMs < 0) {
    throw new Error('IpscTimerConfig.readyMs must be >= 0');
  }
  const { minMs, maxMs } = config.randomDelay;
  if (!Number.isFinite(minMs) || minMs < 0) throw new Error('randomDelay.minMs must be >= 0');
  if (!Number.isFinite(maxMs) || maxMs < minMs) {
    throw new Error('randomDelay.maxMs must be >= minMs');
  }
  if (config.parMs !== undefined && (!Number.isFinite(config.parMs) || config.parMs <= 0)) {
    throw new Error('IpscTimerConfig.parMs must be > 0');
  }
  if (
    config.triggerExcessDb !== undefined &&
    (!Number.isFinite(config.triggerExcessDb) ||
      config.triggerExcessDb < MIN_TRIGGER_EXCESS_DB ||
      config.triggerExcessDb > MAX_TRIGGER_EXCESS_DB)
  ) {
    throw new Error(
      `IpscTimerConfig.triggerExcessDb must be between ${MIN_TRIGGER_EXCESS_DB} and ${MAX_TRIGGER_EXCESS_DB}`,
    );
  }
  if (
    config.maxEventMs !== undefined &&
    (!Number.isFinite(config.maxEventMs) ||
      config.maxEventMs < MIN_EVENT_MS ||
      config.maxEventMs > MAX_EVENT_MS)
  ) {
    throw new Error(
      `IpscTimerConfig.maxEventMs must be between ${MIN_EVENT_MS} and ${MAX_EVENT_MS}`,
    );
  }
}
