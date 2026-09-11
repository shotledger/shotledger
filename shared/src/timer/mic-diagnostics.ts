// Field-diagnostics recorder for the microphone metering path — the data
// collection behind "can metering alone gate shot detection on event
// duration?". Pure: samples in, a JSON-shaped snapshot out. The app layer
// only supplies `expo-audio` levels and a wall clock.
//
// It answers three questions the current amplitude-only detector cannot:
// how far a real shot sits above the room (excess over a tracked noise
// floor), how many ~60 ms samples one shot spans, and how that compares to
// the impostors (a snap, a case hitting concrete, speech) — which is why the
// shooter marks ground truth as they fire.

/** One metering reading plus the noise floor in force when it arrived. */
export interface DiagnosticSample {
  /** ms since recording started. */
  atMs: number;
  /** Level in dBFS (<= 0). */
  db: number;
  /** Tracked noise floor at this sample, in dBFS. */
  noiseFloorDb: number;
}

/** A moment the shooter said "that was a real shot". */
export interface ShotMark {
  /** 0-based order in the recording. */
  index: number;
  /** ms since recording started. */
  atMs: number;
}

/**
 * How the noise floor follows the signal. Asymmetric on purpose: it rises
 * slowly so a muzzle blast barely moves it, and falls quickly so it settles
 * onto a quiet range instead of staying stuck up at the last loud event.
 */
export interface NoiseFloorOptions {
  /** Per-sample fraction of the gap closed while the level is above the floor. */
  riseRate?: number;
  /** Per-sample fraction closed while the level is below it. */
  fallRate?: number;
  /** Floor before any sample has arrived. */
  initialDb?: number;
}

export const DEFAULT_NOISE_FLOOR_OPTIONS: Required<NoiseFloorOptions> = {
  riseRate: 0.004,
  fallRate: 0.08,
  initialDb: -60,
};

/** Exponential follower with separate up/down rates. See NoiseFloorOptions. */
export class NoiseFloorTracker {
  private readonly riseRate: number;
  private readonly fallRate: number;
  private floorDb: number;

  constructor(options: NoiseFloorOptions = {}) {
    const { riseRate, fallRate, initialDb } = { ...DEFAULT_NOISE_FLOOR_OPTIONS, ...options };
    if (!(riseRate > 0 && riseRate <= 1)) throw new Error('riseRate must be in (0, 1]');
    if (!(fallRate > 0 && fallRate <= 1)) throw new Error('fallRate must be in (0, 1]');
    if (!Number.isFinite(initialDb)) throw new Error('initialDb must be finite');
    this.riseRate = riseRate;
    this.fallRate = fallRate;
    this.floorDb = initialDb;
  }

  /** Feeds one level and returns the updated floor. Non-finite levels are ignored. */
  push(db: number): number {
    if (!Number.isFinite(db)) return this.floorDb;
    const rate = db > this.floorDb ? this.riseRate : this.fallRate;
    this.floorDb += rate * (db - this.floorDb);
    return this.floorDb;
  }

  get current(): number {
    return this.floorDb;
  }
}

/**
 * Most recent samples kept in memory. At the shot listener's ~60 ms poll that
 * is roughly 20 minutes — long enough for a range session, bounded so a
 * forgotten recording cannot grow without limit. Older samples are dropped,
 * not the newest, and the count of dropped ones is reported.
 */
export const MAX_DIAGNOSTIC_SAMPLES = 20_000;

/**
 * Window around a mark searched for the shot's peak. Asymmetric because a
 * human taps *after* firing: the blast is behind the tap by a reaction time,
 * not centred on it.
 */
export const MARK_LOOKBACK_MS = 600;
export const MARK_LOOKAHEAD_MS = 200;

export interface MarkWindow {
  lookbackMs: number;
  lookaheadMs: number;
}

export const DEFAULT_MARK_WINDOW: MarkWindow = {
  lookbackMs: MARK_LOOKBACK_MS,
  lookaheadMs: MARK_LOOKAHEAD_MS,
};

/** How far above the noise floor a sample counts as "part of the event". */
export const EVENT_EXCESS_DB = 10;

/** What one marked shot looked like in the metering data. */
export interface MarkAnalysis {
  index: number;
  atMs: number;
  /** Highest level in the window around the mark, or null when no sample fell in it. */
  peakDb: number | null;
  /** Noise floor at the peak, or null with no sample. */
  noiseFloorDb: number | null;
  /** peakDb - noiseFloorDb: how far the shot separated from the room. */
  excessDb: number | null;
  /** Samples in the window at least EVENT_EXCESS_DB above their floor — the event's duration in samples. */
  samplesAboveFloor: number;
}

export interface DiagnosticsSnapshot {
  samples: readonly DiagnosticSample[];
  marks: readonly ShotMark[];
  /** Samples discarded because the buffer was full. */
  droppedSampleCount: number;
  /** Total samples pushed, dropped ones included. */
  totalSampleCount: number;
  /** ms from the first to the last retained sample. */
  durationMs: number;
  /** Highest and lowest retained level, or null before the first sample. */
  maxDb: number | null;
  minDb: number | null;
  /** Current tracked noise floor. */
  noiseFloorDb: number;
}

/** The handful of numbers the live display needs — cheap enough to read per sample. */
export interface DiagnosticsLiveStats {
  /** Most recent level, or null before the first sample. */
  currentDb: number | null;
  /** Highest level since the recording started or the peak was reset. */
  peakDb: number | null;
  noiseFloorDb: number;
  /** Retained samples; `droppedSampleCount` says how many fell off the back. */
  sampleCount: number;
  droppedSampleCount: number;
  markCount: number;
  /** The most recent mark's analysis, so the shooter sees each shot land. */
  lastMark: MarkAnalysis | null;
}

export interface MicDiagnosticsOptions {
  maxSamples?: number;
  noiseFloor?: NoiseFloorOptions;
}

/**
 * Bounded ring of metering samples plus the shooter's ground-truth marks.
 * `push` is called from the metering callback, `mark` from the button. The
 * ring is a fixed array with a write cursor rather than a shifted list: at
 * ~17 samples a second over a range session, an O(n) shift per sample is
 * real work for nothing.
 */
export class MicDiagnosticsRecorder {
  private readonly maxSamples: number;
  private readonly noiseFloorOptions: NoiseFloorOptions;
  private tracker: NoiseFloorTracker;
  private ring: (DiagnosticSample | undefined)[];
  private writeIndex = 0;
  private marks: ShotMark[] = [];
  private droppedSampleCount = 0;
  private totalSampleCount = 0;
  private peakDb: number | null = null;
  private currentDb: number | null = null;
  private lastMark: MarkAnalysis | null = null;

  constructor(options: MicDiagnosticsOptions = {}) {
    const maxSamples = options.maxSamples ?? MAX_DIAGNOSTIC_SAMPLES;
    if (!Number.isInteger(maxSamples) || maxSamples < 1) {
      throw new Error('maxSamples must be a positive integer');
    }
    this.maxSamples = maxSamples;
    this.noiseFloorOptions = options.noiseFloor ?? {};
    this.tracker = new NoiseFloorTracker(this.noiseFloorOptions);
    this.ring = new Array<DiagnosticSample | undefined>(maxSamples);
  }

  /** Records one metering reading. Non-finite levels and negative times are ignored. */
  push(atMs: number, db: number): DiagnosticSample | null {
    if (!Number.isFinite(atMs) || atMs < 0 || !Number.isFinite(db)) return null;
    const noiseFloorDb = this.tracker.push(db);
    const sample: DiagnosticSample = { atMs, db, noiseFloorDb };
    if (this.ring[this.writeIndex] !== undefined) this.droppedSampleCount += 1;
    this.ring[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.maxSamples;
    this.totalSampleCount += 1;
    this.currentDb = db;
    if (this.peakDb === null || db > this.peakDb) this.peakDb = db;
    return sample;
  }

  /**
   * Records a "that was a real shot" mark and analyses it immediately.
   * Ignores a negative time. The analysis only sees samples already in the
   * buffer, so the caller marks after firing — which is what the button is.
   */
  mark(atMs: number): ShotMark | null {
    if (!Number.isFinite(atMs) || atMs < 0) return null;
    const mark: ShotMark = { index: this.marks.length, atMs };
    this.marks.push(mark);
    this.lastMark = analyseMark(this.retainedSamples(), mark);
    return mark;
  }

  /** Clears the peak hold without discarding the recording. */
  resetPeak(): void {
    this.peakDb = this.currentDb;
  }

  reset(): void {
    this.ring = new Array<DiagnosticSample | undefined>(this.maxSamples);
    this.writeIndex = 0;
    this.marks = [];
    this.droppedSampleCount = 0;
    this.totalSampleCount = 0;
    this.peakDb = null;
    this.currentDb = null;
    this.lastMark = null;
    this.tracker = new NoiseFloorTracker(this.noiseFloorOptions);
  }

  getLiveStats(): DiagnosticsLiveStats {
    return {
      currentDb: this.currentDb,
      peakDb: this.peakDb,
      noiseFloorDb: this.tracker.current,
      sampleCount: Math.min(this.totalSampleCount, this.maxSamples),
      droppedSampleCount: this.droppedSampleCount,
      markCount: this.marks.length,
      lastMark: this.lastMark,
    };
  }

  /** Retained samples, oldest first. O(n) — call it on export, not per sample. */
  private retainedSamples(): DiagnosticSample[] {
    const wrapped = this.totalSampleCount > this.maxSamples;
    const ordered = wrapped
      ? [...this.ring.slice(this.writeIndex), ...this.ring.slice(0, this.writeIndex)]
      : this.ring.slice(0, this.writeIndex);
    return ordered.filter((sample): sample is DiagnosticSample => sample !== undefined);
  }

  getSnapshot(): DiagnosticsSnapshot {
    const samples = this.retainedSamples();
    const first = samples[0];
    const last = samples[samples.length - 1];
    let minDb: number | null = null;
    let maxDb: number | null = null;
    for (const sample of samples) {
      if (minDb === null || sample.db < minDb) minDb = sample.db;
      if (maxDb === null || sample.db > maxDb) maxDb = sample.db;
    }
    return {
      samples,
      marks: [...this.marks],
      droppedSampleCount: this.droppedSampleCount,
      totalSampleCount: this.totalSampleCount,
      durationMs: first && last ? last.atMs - first.atMs : 0,
      minDb,
      maxDb,
      noiseFloorDb: this.tracker.current,
    };
  }
}

/** What the metering data shows around one mark. See MarkAnalysis. */
export function analyseMark(
  samples: readonly DiagnosticSample[],
  mark: ShotMark,
  window: MarkWindow = DEFAULT_MARK_WINDOW,
): MarkAnalysis {
  const from = mark.atMs - window.lookbackMs;
  const to = mark.atMs + window.lookaheadMs;
  let peak: DiagnosticSample | null = null;
  let samplesAboveFloor = 0;

  for (const sample of samples) {
    if (sample.atMs < from || sample.atMs > to) continue;
    if (peak === null || sample.db > peak.db) peak = sample;
    if (sample.db - sample.noiseFloorDb >= EVENT_EXCESS_DB) samplesAboveFloor += 1;
  }

  return {
    index: mark.index,
    atMs: mark.atMs,
    peakDb: peak?.db ?? null,
    noiseFloorDb: peak?.noiseFloorDb ?? null,
    excessDb: peak ? peak.db - peak.noiseFloorDb : null,
    samplesAboveFloor,
  };
}

export const MIC_DIAGNOSTICS_FORMAT = 'shotledger.mic-diagnostics';
export const MIC_DIAGNOSTICS_VERSION = 1;

/** Free-text context the app layer knows and this module does not. */
export interface MicDiagnosticsMeta {
  generatedAt: string;
  appVersion: string;
  platform: string;
  /** OS version string, when the platform exposes one. */
  osVersion?: string;
  deviceName?: string;
  /** Nominal polling interval of the metering path, in ms. */
  sampleIntervalMs: number;
  /** What the shooter was firing, typed in on the screen. Free text, never PII. */
  note?: string;
}

export interface MicDiagnosticsJson {
  format: typeof MIC_DIAGNOSTICS_FORMAT;
  version: typeof MIC_DIAGNOSTICS_VERSION;
  generatedAt: string;
  appVersion: string;
  device: { platform: string; osVersion: string | null; name: string | null };
  note: string | null;
  sampleIntervalMs: number;
  noiseFloor: Required<NoiseFloorOptions>;
  eventExcessDb: number;
  markWindow: MarkWindow;
  summary: {
    sampleCount: number;
    droppedSampleCount: number;
    totalSampleCount: number;
    durationMs: number;
    minDb: number | null;
    maxDb: number | null;
    finalNoiseFloorDb: number;
    markCount: number;
  };
  marks: MarkAnalysis[];
  /** Every retained sample, oldest first — the point of the whole exercise. */
  samples: DiagnosticSample[];
}

/**
 * The export document. A stable, documented contract: `format` and `version`
 * first so a consumer can dispatch on them, every retained sample verbatim,
 * and the analysis parameters alongside so a reading can be recomputed.
 */
export function buildMicDiagnosticsJson(
  snapshot: DiagnosticsSnapshot,
  meta: MicDiagnosticsMeta,
  noiseFloorOptions: NoiseFloorOptions = {},
): MicDiagnosticsJson {
  return {
    format: MIC_DIAGNOSTICS_FORMAT,
    version: MIC_DIAGNOSTICS_VERSION,
    generatedAt: meta.generatedAt,
    appVersion: meta.appVersion,
    device: {
      platform: meta.platform,
      osVersion: meta.osVersion ?? null,
      name: meta.deviceName ?? null,
    },
    note: meta.note?.trim() ? meta.note.trim() : null,
    sampleIntervalMs: meta.sampleIntervalMs,
    noiseFloor: { ...DEFAULT_NOISE_FLOOR_OPTIONS, ...noiseFloorOptions },
    eventExcessDb: EVENT_EXCESS_DB,
    markWindow: DEFAULT_MARK_WINDOW,
    summary: {
      sampleCount: snapshot.samples.length,
      droppedSampleCount: snapshot.droppedSampleCount,
      totalSampleCount: snapshot.totalSampleCount,
      durationMs: snapshot.durationMs,
      minDb: snapshot.minDb,
      maxDb: snapshot.maxDb,
      finalNoiseFloorDb: snapshot.noiseFloorDb,
      markCount: snapshot.marks.length,
    },
    marks: snapshot.marks.map((mark) => analyseMark(snapshot.samples, mark)),
    samples: [...snapshot.samples],
  };
}
