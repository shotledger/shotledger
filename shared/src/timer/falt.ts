// Fälttimer — the range officer's command sequence for fältskjutning
// (plan.md "Timers"/"Fälttimer"). Pure: a plan builder that turns the
// user's settings into a list of cues at absolute times, plus a cursor
// engine over that plan. No RN/audio/speech imports — the app layer maps
// each cue to speech (expo-speech), a tone and a vibration.
//
// Commands and their timings are SHB 2026 D.6.2 p. 88 ("Kommandoord"):
// LADDA ca 30 s före ALLA KLARA, 10 SEKUNDER KVAR 10 s före ELD, FÄRDIGA
// 3 s före seriens början, ELD UPPHÖR "utdrages under 3 sek" (i.e. the
// call *begins* 3 s before the shooting time runs out and ends exactly at
// its end), PATRON UR/PROPPA VAPEN efter skjuttidens slut, then
// VISITATION and MARKERA.

/** Competition starts at LADDA with a preparation countdown; training starts at ALLA KLARA. */
export type FaltMode = 'competition' | 'training';

export const DEFAULT_PREP_SECONDS = 30;
export const MIN_PREP_SECONDS = 10;
export const MAX_PREP_SECONDS = 90;

export const DEFAULT_SHOOTING_SECONDS = 8;
export const MIN_SHOOTING_SECONDS = 3;
export const MAX_SHOOTING_SECONDS = 300;

/** One-tap shooting times offered in the UI. Ordinary fältskjutning series are short; the longer ones cover magnum/precision stations. */
export const SHOOTING_TIME_PRESETS: readonly number[] = [6, 8, 10, 12, 15, 20, 30];

/** ALLA KLARA → ELD (SHB: "10 sekunder före ELD"). */
export const READY_COUNTDOWN_SECONDS = 10;
/** FÄRDIGA lead before ELD (SHB: "3 sekunder före seriens början"). */
export const FARDIGA_LEAD_SECONDS = 3;
/** ELD UPPHÖR is drawn out over the last 3 s of the shooting time (SHB: "utdrages under 3 sek"). */
export const ELD_UPPHOR_LEAD_SECONDS = 3;
/** PATRON UR! PROPPA VAPEN! after the shooting time ends. */
export const PATRON_UR_DELAY_SECONDS = 3;
/** VISITATION! after PATRON UR. */
export const VISITATION_DELAY_SECONDS = 4;

/** Speech rate multiplier for the drawn-out ELD UPPHÖR (1 = normal). */
export const ELD_UPPHOR_SPEECH_RATE = 0.55;

export type FaltCueKind =
  | 'ladda'
  | 'allaKlara'
  | 'tenSeconds'
  | 'fardiga'
  | 'eld'
  /** The prolonged "Eld upphör!" call begins (shooting end − 3 s). */
  | 'eldUpphor'
  /** The shooting time is over — the moment the prolonged call ends. */
  | 'ceaseFire'
  | 'patronUr'
  | 'visitation'
  /** A user-placed parti/delmoment boundary inside the shooting time. */
  | 'event';

/**
 * The Swedish command wording is SPSF-regulated (SHB D.6.2) and is spoken
 * in sv-SE whatever the app's UI language is — so it lives here as data,
 * not in the i18n catalogues (whose job is the *labels* around it).
 */
export const FALT_COMMAND_TEXT: Record<Exclude<FaltCueKind, 'ceaseFire' | 'event'>, string> = {
  ladda: 'Ladda!',
  allaKlara: 'Alla klara?',
  tenSeconds: 'Tio sekunder kvar!',
  fardiga: 'Färdiga!',
  eld: 'Eld!',
  eldUpphor: 'Eld upphör!',
  patronUr: 'Patron ur! Proppa vapen!',
  visitation: 'Visitation!',
};

/** MARKERA is untimed — given by tap after VISITATION, so it is not part of the plan's cues. */
export const FALT_MARKERA_TEXT = 'Markera!';

/** One cue at an absolute time on the plan's own clock (0 = the first command). */
export interface FaltCue {
  kind: FaltCueKind;
  atMs: number;
  /** Swedish command to speak, or undefined for the tone-only cues ('ceaseFire', 'event'). */
  speech?: string;
  /** Speech rate multiplier; only set where it differs from normal (the drawn-out ELD UPPHÖR). */
  speechRate?: number;
  /** Whether the host should vibrate for this cue. */
  vibrate: boolean;
  /** 1-based position of the parti boundary, for 'event' cues only. */
  eventIndex?: number;
}

export interface FaltTimerSettings {
  mode: FaltMode;
  /** LADDA → ALLA KLARA. Competition mode only; ignored in training. */
  prepSeconds: number;
  shootingSeconds: number;
  /** Whole seconds strictly inside the shooting window, ascending and unique. */
  eventSeconds: readonly number[];
  /** Replace the spoken "Eld upphör!" with a whistle-style tone (SHB: "kan ersättas med visselsignal"). */
  whistle: boolean;
}

export const DEFAULT_FALT_SETTINGS: FaltTimerSettings = {
  mode: 'competition',
  prepSeconds: DEFAULT_PREP_SECONDS,
  shootingSeconds: DEFAULT_SHOOTING_SECONDS,
  eventSeconds: [],
  whistle: false,
};

export interface FaltPlan {
  /** The settings the plan was built from, normalized (events sorted, prep zeroed in training). */
  settings: FaltTimerSettings;
  cues: readonly FaltCue[];
  /** ALLA KLARA. 0 in training mode. */
  readyStartMs: number;
  /** ELD — the start of the shooting time. */
  eldAtMs: number;
  /** End of the shooting time. */
  shootingEndMs: number;
  /** VISITATION, after which the plan waits for the untimed MARKERA tap. */
  totalMs: number;
}

function requireIntegerInRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
}

/** Validates and normalizes settings: sorts events, zeroes an unused prep time. */
export function normalizeFaltSettings(settings: FaltTimerSettings): FaltTimerSettings {
  requireIntegerInRange(
    settings.shootingSeconds,
    MIN_SHOOTING_SECONDS,
    MAX_SHOOTING_SECONDS,
    'shootingSeconds',
  );
  if (settings.mode === 'competition') {
    requireIntegerInRange(settings.prepSeconds, MIN_PREP_SECONDS, MAX_PREP_SECONDS, 'prepSeconds');
  }

  const events = [...settings.eventSeconds].sort((a, b) => a - b);
  events.forEach((second, i) => {
    if (!Number.isInteger(second) || second <= 0 || second >= settings.shootingSeconds) {
      throw new Error(
        `eventSeconds must be whole seconds strictly inside the shooting time (0 < t < ${settings.shootingSeconds})`,
      );
    }
    if (i > 0 && second === events[i - 1]) throw new Error('eventSeconds must be unique');
  });

  return {
    mode: settings.mode,
    prepSeconds: settings.mode === 'competition' ? settings.prepSeconds : 0,
    shootingSeconds: settings.shootingSeconds,
    eventSeconds: events,
    whistle: settings.whistle,
  };
}

function command(kind: Exclude<FaltCueKind, 'ceaseFire' | 'event'>, atMs: number): FaltCue {
  return { kind, atMs, speech: FALT_COMMAND_TEXT[kind], vibrate: kind === 'eld' };
}

/**
 * Builds the full command plan. Times are ms on the plan's own clock, with
 * 0 at the first command (LADDA in competition, ALLA KLARA in training).
 */
export function buildFaltPlan(settings: FaltTimerSettings): FaltPlan {
  const normalized = normalizeFaltSettings(settings);
  const readyStartMs = normalized.prepSeconds * 1_000;
  const eldAtMs = readyStartMs + READY_COUNTDOWN_SECONDS * 1_000;
  const shootingEndMs = eldAtMs + normalized.shootingSeconds * 1_000;
  const patronUrMs = shootingEndMs + PATRON_UR_DELAY_SECONDS * 1_000;
  const visitationMs = patronUrMs + VISITATION_DELAY_SECONDS * 1_000;

  const cues: FaltCue[] = [];
  if (normalized.mode === 'competition') cues.push(command('ladda', 0));
  cues.push(command('allaKlara', readyStartMs));
  // SHB puts "10 SEKUNDER KVAR" 10 s before ELD, i.e. immediately after
  // ALLA KLARA — the host speaks them back to back.
  cues.push(command('tenSeconds', readyStartMs));
  cues.push(command('fardiga', eldAtMs - FARDIGA_LEAD_SECONDS * 1_000));
  cues.push(command('eld', eldAtMs));

  normalized.eventSeconds.forEach((second, i) => {
    cues.push({ kind: 'event', atMs: eldAtMs + second * 1_000, vibrate: true, eventIndex: i + 1 });
  });

  // The drawn-out call starts 3 s before the end — clamped to ELD itself for
  // a 3 s shooting time, the shortest allowed, where the two coincide.
  const eldUpphorAtMs = Math.max(eldAtMs, shootingEndMs - ELD_UPPHOR_LEAD_SECONDS * 1_000);
  cues.push({
    ...command('eldUpphor', eldUpphorAtMs),
    // The whistle variant replaces the words entirely.
    speech: normalized.whistle ? undefined : FALT_COMMAND_TEXT.eldUpphor,
    speechRate: normalized.whistle ? undefined : ELD_UPPHOR_SPEECH_RATE,
  });
  cues.push({ kind: 'ceaseFire', atMs: shootingEndMs, vibrate: true });
  cues.push(command('patronUr', patronUrMs));
  cues.push(command('visitation', visitationMs));

  cues.sort((a, b) => a.atMs - b.atMs);

  return {
    settings: normalized,
    cues,
    readyStartMs,
    eldAtMs,
    shootingEndMs,
    totalMs: visitationMs,
  };
}

/**
 * Seconds between consecutive parti boundaries — the intervals shown on the
 * timeline: 0 → first event, between events, last event → end of the
 * shooting time. With no events this is just `[shootingSeconds]`.
 */
export function faltEventIntervals(settings: FaltTimerSettings): readonly number[] {
  const { eventSeconds, shootingSeconds } = normalizeFaltSettings(settings);
  const bounds = [0, ...eventSeconds, shootingSeconds];
  return bounds.slice(1).map((second, i) => second - bounds[i]!);
}

export type FaltPhaseKind =
  | 'idle'
  /** LADDA → ALLA KLARA (competition only). */
  | 'prep'
  /** ALLA KLARA → ELD. */
  | 'ready'
  /** ELD → the end of the shooting time. */
  | 'shooting'
  /** After the shooting time: PATRON UR, VISITATION, then waiting for MARKERA. */
  | 'clearing'
  /** MARKERA has been given. */
  | 'done';

export interface FaltPhase {
  kind: FaltPhaseKind;
  /** ms since the first command. */
  elapsedMs: number;
  /** ms left in the current phase; 0 in idle/clearing/done. */
  remainingMs: number;
  /** ms since ELD, clamped to the shooting time; 0 before it. */
  shootingElapsedMs: number;
  /** ms of shooting time left; 0 outside it. */
  shootingRemainingMs: number;
  /** Parti boundaries already passed (0-based count), for the timeline highlight. */
  eventsPassed: number;
}

/**
 * A cursor over a `FaltPlan`: `start()`, `advance(deltaMs)`, `pause()`,
 * `resume()`, `reset()` are the only ways time moves, so the host owns the
 * clock (a `setInterval` in the app, fake time in tests).
 */
export class FaltTimerEngine {
  private readonly plan: FaltPlan;
  private elapsedMs = 0;
  private nextCueIndex = 0;
  private running = false;
  private started = false;
  private marked = false;

  constructor(settings: FaltTimerSettings = DEFAULT_FALT_SETTINGS) {
    this.plan = buildFaltPlan(settings);
  }

  getPlan(): FaltPlan {
    return this.plan;
  }

  /** idle → the first command. Returns the cues at t = 0. Throws if already started. */
  start(): readonly FaltCue[] {
    if (this.started) throw new Error('FaltTimerEngine.start() called twice');
    this.started = true;
    this.running = true;
    return this.collectCuesUpTo(0);
  }

  /** Advances the clock, returning every cue crossed, in order. No-op while paused, before start, or after MARKERA. */
  advance(deltaMs: number): readonly FaltCue[] {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('FaltTimerEngine.advance() requires deltaMs >= 0');
    }
    if (!this.running) return [];
    this.elapsedMs = Math.min(this.plan.totalMs, this.elapsedMs + deltaMs);
    return this.collectCuesUpTo(this.elapsedMs);
  }

  /** Holds the clock (the range officer stopping the series). No-op unless running. */
  pause(): void {
    if (this.started && !this.marked) this.running = false;
  }

  resume(): void {
    if (this.started && !this.marked) this.running = true;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** MARKERA — the untimed final command, given by tap. */
  markera(): void {
    if (!this.started) return;
    this.marked = true;
    this.running = false;
  }

  /** Back to idle, discarding the run. */
  reset(): void {
    this.elapsedMs = 0;
    this.nextCueIndex = 0;
    this.running = false;
    this.started = false;
    this.marked = false;
  }

  getElapsedMs(): number {
    return this.elapsedMs;
  }

  getPhase(): FaltPhase {
    const { eldAtMs, readyStartMs, shootingEndMs, settings } = this.plan;
    const elapsed = this.elapsedMs;
    const shootingElapsed = Math.min(
      Math.max(0, elapsed - eldAtMs),
      settings.shootingSeconds * 1_000,
    );

    let kind: FaltPhaseKind;
    let remainingMs = 0;
    if (this.marked) kind = 'done';
    else if (!this.started) kind = 'idle';
    else if (elapsed < readyStartMs) {
      kind = 'prep';
      remainingMs = readyStartMs - elapsed;
    } else if (elapsed < eldAtMs) {
      kind = 'ready';
      remainingMs = eldAtMs - elapsed;
    } else if (elapsed < shootingEndMs) {
      kind = 'shooting';
      remainingMs = shootingEndMs - elapsed;
    } else kind = 'clearing';

    return {
      kind,
      elapsedMs: elapsed,
      remainingMs,
      shootingElapsedMs: shootingElapsed,
      shootingRemainingMs:
        kind === 'shooting' ? settings.shootingSeconds * 1_000 - shootingElapsed : 0,
      eventsPassed: settings.eventSeconds.filter((second) => shootingElapsed >= second * 1_000)
        .length,
    };
  }

  private collectCuesUpTo(atMs: number): readonly FaltCue[] {
    const due: FaltCue[] = [];
    while (this.nextCueIndex < this.plan.cues.length) {
      const cue = this.plan.cues[this.nextCueIndex]!;
      if (cue.atMs > atMs) break;
      due.push(cue);
      this.nextCueIndex += 1;
    }
    return due;
  }
}
