// Shot timer engine (docs/specs/shot-timer-spec.md). A pure state machine:
// `start()`/`advance(deltaMs)`/`reset()` are the only ways time moves, so the
// host (a React hook driving a `setInterval`, or a test driving fake time)
// controls the clock entirely — no timers, no RN imports, no side effects.
//
// Phase sequence per series i: rest (skipped before series 0) → readyDelay →
// series. After the last series' stop signal the engine enters `done` and
// emits an extra `complete` cue. `advance()` can cross several phase
// boundaries in one call (e.g. a test fast-forwarding past a whole drill, or
// a host tick landing after a zero-length phase) — it loops until the delta
// is consumed or the drill reaches `done`.
import type {
  RandomDelayRange,
  SeriesSpec,
  TimerConfig,
  TimerCue,
  TimerEngineDeps,
  TimerEvent,
  TimerPhase,
  TimerPhaseKind,
} from './types';

export * from './types';

function validateConfig(config: TimerConfig): void {
  if (config.series.length === 0) throw new Error('TimerConfig.series must not be empty');
  config.series.forEach((series, i) => {
    if (series.index !== i) throw new Error(`TimerConfig.series[${i}].index must equal ${i}`);
    if (!Number.isFinite(series.durationMs) || series.durationMs <= 0) {
      throw new Error(`TimerConfig.series[${i}].durationMs must be > 0`);
    }
  });
  if (!Number.isFinite(config.restMs) || config.restMs < 0) {
    throw new Error('TimerConfig.restMs must be >= 0');
  }
  if (config.randomReadyDelay) {
    const { minMs, maxMs } = config.randomReadyDelay;
    if (!Number.isFinite(minMs) || minMs < 0) throw new Error('randomReadyDelay.minMs must be >= 0');
    if (!Number.isFinite(maxMs) || maxMs < minMs) {
      throw new Error('randomReadyDelay.maxMs must be >= minMs');
    }
  } else if (!Number.isFinite(config.readyDelayMs) || config.readyDelayMs < 0) {
    throw new Error('TimerConfig.readyDelayMs must be >= 0');
  }
}

function drawReadyDelayMs(config: TimerConfig, random: () => number): number {
  const range: RandomDelayRange | undefined = config.randomReadyDelay;
  if (!range) return config.readyDelayMs;
  return range.minMs + random() * (range.maxMs - range.minMs);
}

export class TimerEngine {
  private readonly config: TimerConfig;
  private readonly random: () => number;

  private phaseKind: TimerPhaseKind = 'idle';
  private seriesIndex = -1;
  private remainingMs = 0;
  private elapsedInPhaseMs = 0;
  private totalElapsedMs = 0;

  constructor(config: TimerConfig, deps: TimerEngineDeps = {}) {
    validateConfig(config);
    this.config = config;
    this.random = deps.random ?? Math.random;
  }

  /** Starts the drill: idle → readyDelay for series 0. Throws if not idle. */
  start(): readonly TimerEvent[] {
    if (this.phaseKind !== 'idle') throw new Error('TimerEngine.start() called while not idle');
    this.totalElapsedMs = 0;
    return this.enterReadyDelay(0);
  }

  /** Advances the clock by `deltaMs`, returning every cue crossed along the way, in order. */
  advance(deltaMs: number): readonly TimerEvent[] {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('TimerEngine.advance() requires deltaMs >= 0');
    }
    if (this.isTerminal()) return [];

    const events: TimerEvent[] = [];
    let remaining = deltaMs;

    // Bounded by construction: each iteration either exits via `break` or
    // consumes one of the finitely many phases in `config.series` (every
    // series has durationMs > 0, so the chain cannot loop forever even when
    // readyDelayMs/restMs are 0) — a `done` phase always ends it.
    // `isTerminal()` (rather than a direct `this.phaseKind` comparison) is
    // deliberate: it stops TS narrowing `this.phaseKind`'s type from the
    // guard above across mutations made deep inside `transitionFromPhaseEnd()`.
    while (remaining > 0 && !this.isTerminal()) {
      if (remaining < this.remainingMs) {
        this.remainingMs -= remaining;
        this.elapsedInPhaseMs += remaining;
        this.totalElapsedMs += remaining;
        remaining = 0;
        break;
      }

      const consumed = this.remainingMs;
      remaining -= consumed;
      this.totalElapsedMs += consumed;
      this.elapsedInPhaseMs += consumed;
      this.remainingMs = 0;
      events.push(...this.transitionFromPhaseEnd());
    }

    return events;
  }

  /** Aborts the drill (manual Stop/Reset) and returns to idle. No cue — a UI-driven cancel, not a drill event. */
  reset(): void {
    this.phaseKind = 'idle';
    this.seriesIndex = -1;
    this.remainingMs = 0;
    this.elapsedInPhaseMs = 0;
    this.totalElapsedMs = 0;
  }

  private isTerminal(): boolean {
    return this.phaseKind === 'idle' || this.phaseKind === 'done';
  }

  getPhase(): TimerPhase {
    return {
      kind: this.phaseKind,
      seriesIndex: this.seriesIndex,
      remainingMs: Math.max(0, this.remainingMs),
      elapsedMs: this.elapsedInPhaseMs,
    };
  }

  getElapsedMs(): number {
    return this.totalElapsedMs;
  }

  getConfig(): TimerConfig {
    return this.config;
  }

  currentSeriesSpec(): SeriesSpec | undefined {
    return this.seriesIndex >= 0 ? this.config.series[this.seriesIndex] : undefined;
  }

  private enterReadyDelay(seriesIndex: number): readonly TimerEvent[] {
    this.phaseKind = 'readyDelay';
    this.seriesIndex = seriesIndex;
    this.remainingMs = drawReadyDelayMs(this.config, this.random);
    this.elapsedInPhaseMs = 0;
    return [this.emit({ kind: 'ready', seriesIndex, vibrate: false })];
  }

  private enterSeries(seriesIndex: number): readonly TimerEvent[] {
    this.phaseKind = 'series';
    this.seriesIndex = seriesIndex;
    this.remainingMs = this.config.series[seriesIndex]!.durationMs;
    this.elapsedInPhaseMs = 0;
    return [this.emit({ kind: 'start', seriesIndex, vibrate: true })];
  }

  private enterRest(seriesIndex: number): readonly TimerEvent[] {
    // `seriesIndex` here is the series the rest is waiting to lead into.
    this.phaseKind = 'rest';
    this.seriesIndex = seriesIndex;
    this.remainingMs = this.config.restMs;
    this.elapsedInPhaseMs = 0;
    return [];
  }

  private enterDone(finishedSeriesIndex: number): readonly TimerEvent[] {
    this.phaseKind = 'done';
    this.seriesIndex = -1;
    this.remainingMs = 0;
    this.elapsedInPhaseMs = 0;
    return [this.emit({ kind: 'complete', seriesIndex: finishedSeriesIndex, vibrate: true })];
  }

  // Only called from `advance()`'s loop, whose guard already restricts
  // `phaseKind` to 'readyDelay' | 'series' | 'rest' — the final `else`
  // covers 'rest' without a dead `idle`/`done` fallback branch.
  private transitionFromPhaseEnd(): readonly TimerEvent[] {
    if (this.phaseKind === 'readyDelay') {
      return this.enterSeries(this.seriesIndex);
    }
    if (this.phaseKind === 'series') {
      const finished = this.seriesIndex;
      const stopEvent = this.emit({ kind: 'stop', seriesIndex: finished, vibrate: true });
      const isLast = finished === this.config.series.length - 1;
      return isLast ? [stopEvent, ...this.enterDone(finished)] : [stopEvent, ...this.enterRest(finished + 1)];
    }
    return this.enterReadyDelay(this.seriesIndex);
  }

  private emit(cue: TimerCue): TimerEvent {
    return { atMs: this.totalElapsedMs, cue, phase: this.getPhase() };
  }
}
