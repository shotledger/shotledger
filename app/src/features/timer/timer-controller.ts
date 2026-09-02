// Drives a `TimerEngine` (shared/src/timer) off a wall clock and turns its
// cue events into effect calls (sound/vibration). Plain TS, no RN/React
// imports — the "UI hook logic" the shot-timer task asks to unit-test:
// `use-timer.ts` is a thin `useState`/`setInterval` wrapper around this that
// isn't independently tested, matching this codebase's existing precedent
// (`use-home-data.ts` has no test either — the logic underneath does).
import {
  TimerEngine,
  type TimerConfig,
  type TimerCueKind,
  type TimerEvent,
  type TimerPhase,
} from '@shotledger/shared';

export interface TimerEffects {
  playSound: (kind: TimerCueKind) => void;
  vibrate: () => void;
}

export class TimerController {
  private readonly engine: TimerEngine;
  private readonly effects: TimerEffects;
  private lastTickAtMs: number | null = null;

  constructor(config: TimerConfig, effects: TimerEffects) {
    this.engine = new TimerEngine(config);
    this.effects = effects;
  }

  /** Starts the drill at wall-clock time `nowMs` and applies effects for the initial ready cue. */
  start(nowMs: number): TimerPhase {
    this.lastTickAtMs = nowMs;
    this.applyEvents(this.engine.start());
    return this.engine.getPhase();
  }

  /** Advances the engine to wall-clock time `nowMs`, applying effects for every cue crossed. No-op before `start()`/after `reset()`. */
  tick(nowMs: number): TimerPhase {
    if (this.lastTickAtMs === null) return this.engine.getPhase();
    const deltaMs = Math.max(0, nowMs - this.lastTickAtMs);
    this.lastTickAtMs = nowMs;
    this.applyEvents(this.engine.advance(deltaMs));
    return this.engine.getPhase();
  }

  reset(): TimerPhase {
    this.lastTickAtMs = null;
    this.engine.reset();
    return this.engine.getPhase();
  }

  getPhase(): TimerPhase {
    return this.engine.getPhase();
  }

  getElapsedMs(): number {
    return this.engine.getElapsedMs();
  }

  getConfig(): TimerConfig {
    return this.engine.getConfig();
  }

  isRunning(): boolean {
    const kind = this.engine.getPhase().kind;
    return kind !== 'idle' && kind !== 'done';
  }

  private applyEvents(events: readonly TimerEvent[]): void {
    for (const event of events) {
      this.effects.playSound(event.cue.kind);
      if (event.cue.vibrate) this.effects.vibrate();
    }
  }
}
