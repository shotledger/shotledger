// IPSC-style shot timer: pure shot detection + run state machine (plan.md
// "IPSC-style shot timer"). No RN/audio imports — the app layer feeds
// microphone metering samples in and maps the emitted cues to sound.
//
// Detection is deliberately simple and explainable: a sample counts as a shot
// when its level crosses the sensitivity threshold AND at least `minGapMs`
// has passed since the previous shot. A muzzle blast is far above room noise,
// so a peak threshold plus a debounce covers the realistic case; the gap
// suppresses the multi-sample tail of one shot being counted twice.

/** Microphone sensitivity. Lower thresholds (high sensitivity) trigger on quieter peaks. */
export type ShotSensitivity = 'low' | 'medium' | 'high';

/**
 * Trigger level in dBFS (expo-audio's `metering` scale: 0 = full scale,
 * negative = quieter). Starting points for a phone at arm's length on an
 * outdoor range — the user picks; nothing here is a measured constant.
 */
export const SENSITIVITY_THRESHOLD_DB: Record<ShotSensitivity, number> = {
  low: -12,
  medium: -22,
  high: -32,
};

/** Default debounce between two shots; below this a second peak is the same shot's tail. */
export const DEFAULT_MIN_SHOT_GAP_MS = 80;

/** One metering reading from the microphone. `atMs` is relative to the start beep. */
export interface MeteringSample {
  atMs: number;
  /** Level in dBFS (<= 0). */
  db: number;
}

export interface DetectedShot {
  /** 0-based order in the string. */
  index: number;
  /** ms after the start beep. */
  atMs: number;
  /** ms since the previous shot; equals `atMs` for the first shot. */
  splitMs: number;
}

export interface ShotDetectorOptions {
  sensitivity?: ShotSensitivity;
  /** Overrides the sensitivity preset when set. */
  thresholdDb?: number;
  minGapMs?: number;
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

/**
 * Detects shots in a stream of metering samples. Samples pushed before
 * `arm()` (i.e. before the start beep) are ignored, so a shooter who fires
 * early does not get a phantom shot 0.
 */
export class ShotDetector {
  private readonly thresholdDb: number;
  private readonly minGapMs: number;
  private armed = false;
  private lastShotAtMs: number | null = null;
  private shots: DetectedShot[] = [];

  constructor(options: ShotDetectorOptions = {}) {
    const preset = SENSITIVITY_THRESHOLD_DB[options.sensitivity ?? 'medium'];
    this.thresholdDb = options.thresholdDb ?? preset;
    const gap = options.minGapMs ?? DEFAULT_MIN_SHOT_GAP_MS;
    if (!Number.isFinite(gap) || gap < 0) throw new Error('minGapMs must be >= 0');
    this.minGapMs = gap;
  }

  /** Starts accepting samples. Called at the start beep. */
  arm(): void {
    this.armed = true;
  }

  isArmed(): boolean {
    return this.armed;
  }

  /** Feeds one sample; returns the shot it triggered, or null. */
  push(sample: MeteringSample): DetectedShot | null {
    if (!this.armed) return null;
    if (!Number.isFinite(sample.db) || sample.db < this.thresholdDb) return null;
    if (sample.atMs < 0) return null;
    if (this.lastShotAtMs !== null && sample.atMs - this.lastShotAtMs < this.minGapMs) return null;

    const splitMs = this.lastShotAtMs === null ? sample.atMs : sample.atMs - this.lastShotAtMs;
    const shot: DetectedShot = { index: this.shots.length, atMs: sample.atMs, splitMs };
    this.shots.push(shot);
    this.lastShotAtMs = sample.atMs;
    return shot;
  }

  getShots(): readonly DetectedShot[] {
    return this.shots;
  }

  /** ms since the last shot (or since the beep with no shots yet) at `nowMs`. */
  silenceMsAt(nowMs: number): number {
    return nowMs - (this.lastShotAtMs ?? 0);
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

  reset(): void {
    this.armed = false;
    this.lastShotAtMs = null;
    this.shots = [];
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

  /** Advances the clock, returning cues crossed in order. */
  advance(deltaMs: number): readonly IpscCueKind[] {
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
        remaining = 0;
        const silenceLimit = this.config.autoStopSilenceMs ?? 0;
        if (silenceLimit > 0 && this.detector.silenceMsAt(this.runElapsedMs) >= silenceLimit) {
          cues.push(...this.stop());
        }
        break;
      }

      if (remaining < this.remainingMs) {
        this.remainingMs -= remaining;
        remaining = 0;
        break;
      }

      remaining -= this.remainingMs;
      this.remainingMs = 0;
      cues.push(...this.enterNextCountdownPhase());
    }

    return cues;
  }

  private enterNextCountdownPhase(): readonly IpscCueKind[] {
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
    this.detector.arm();
    return ['start'];
  }

  /** Feeds one microphone level while running. Returns the shot it triggered, or null. */
  pushLevel(db: number): DetectedShot | null {
    if (this.kind !== 'running') return null;
    return this.detector.push({ atMs: this.runElapsedMs, db });
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
}
