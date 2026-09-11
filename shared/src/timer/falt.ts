// Fälttimer — the range officer's command sequence for fältskjutning.
// Pure: a program builder that turns the
// user's settings into a numbered list of commands at times **relative to
// ELD**, plus a cursor engine over that program. No RN/audio/speech imports —
// the app layer maps each cue to speech, a tone and a vibration.
//
// **t = 0 is ELD.** Preparatory commands sit at negative times and the firing
// period runs positive, which is how the sequence is actually described on
// the line ("tio sekunder kvar" = t −10). The two anchors that follow from it
// and that the tests pin: TIO SEKUNDER KVAR at exactly −10, and ELD UPPHÖR
// *starting* at T−3 so the drawn-out call ends exactly at T.
//
// Commands and their timings are SHB 2026 D.6.2 p. 88 ("Kommandoord"):
// LADDA ca 30 s före ALLA KLARA, 10 SEKUNDER KVAR 10 s före ELD, FÄRDIGA
// 3 s före seriens början, ELD UPPHÖR "utdrages under 3 sek", PATRON UR/
// PROPPA VAPEN efter skjuttidens slut, then VISITATION. SHB gives no interval
// for ALLA KLARA itself; the ~5 s before TIO SEKUNDER KVAR is the maintainer's
// (2026-09-09), so shooters can announce that they are not ready.

/**
 * Who is running the sequence.
 *
 * - `rangeOfficer` — LADDA and ALLA KLARA are given by a button press, because
 *   how long the shooters need is the range officer's judgement, not a timer's.
 *   The clock only takes over at TIO SEKUNDER KVAR (t −10).
 * - `solo` — one shooter timing themselves: automatic from LADDA, with a
 *   settable LADDA → ALLA KLARA gap that only this mode has.
 */
export type FaltMode = 'rangeOfficer' | 'solo';

/** LADDA → ALLA KLARA, solo mode only (SHB: "ca 30 s före ALLA KLARA"). */
export const DEFAULT_LADDA_SECONDS = 30;
export const MIN_LADDA_SECONDS = 5;
export const MAX_LADDA_SECONDS = 90;

export const DEFAULT_SHOOTING_SECONDS = 8;
export const MIN_SHOOTING_SECONDS = 3;
export const MAX_SHOOTING_SECONDS = 300;
/**
 * Where the shooting-time slider ends. Every ordinary fält station is inside
 * it; a 3–300 s slider would be a fifth of a pixel per second and unusable for
 * the 6–15 s that are actually shot. Longer times stay legal in the model — a
 * stored one still runs — they just are not dialled in by dragging.
 */
export const MAX_SHOOTING_SLIDER_SECONDS = 60;

/** ALLA KLARA → TIO SEKUNDER KVAR, so shooters can say they are not ready. */
export const ALLA_KLARA_LEAD_SECONDS = 5;
/** TIO SEKUNDER KVAR before ELD (SHB: "10 sekunder före ELD"). */
export const TEN_SECONDS_LEAD_SECONDS = 10;
/** FÄRDIGA before ELD (SHB: "3 sekunder före seriens början"). */
export const FARDIGA_LEAD_SECONDS = 3;
/** ELD UPPHÖR is drawn out over the last 3 s of the shooting time (SHB: "utdrages under 3 sek"). */
export const ELD_UPPHOR_LEAD_SECONDS = 3;
/** PATRON UR! PROPPA VAPEN! after the shooting time ends. */
export const PATRON_UR_DELAY_SECONDS = 3;
/** VISITATION! after PATRON UR. */
export const VISITATION_DELAY_SECONDS = 4;

/** ALLA KLARA's place on the ELD-anchored timeline: −15 s. */
export const ALLA_KLARA_AT_SECONDS = -(TEN_SECONDS_LEAD_SECONDS + ALLA_KLARA_LEAD_SECONDS);

/** One-tap shooting times offered in the UI. Ordinary fältskjutning series are short; the longer ones cover magnum/precision stations. */
export const SHOOTING_TIME_PRESETS: readonly number[] = [6, 8, 10, 12, 15, 20, 30];

/**
 * Speech rate multiplier for the drawn-out ELD UPPHÖR (1 = normal).
 *
 * The call has to fill ELD_UPPHOR_LEAD_SECONDS: it begins at T−3 and the time
 * is up as it ends. At 0.55 the utterance ran about 2 s and finished early
 * (maintainer, on device 2026-09-11) — audibly not "utdraget". 0.4 is the
 * slowest that still sounds like a command rather than a drag.
 *
 * TTS gives no duration guarantee: the actual length depends on the engine
 * and voice, so this is a tuned approximation. Whistle mode is the exact
 * three seconds, because that is a fixed-length asset rather than speech.
 */
export const ELD_UPPHOR_SPEECH_RATE = 0.4;

/** A numbered step of the sequence. */
export type FaltCommandKind =
  | 'ladda'
  | 'allaKlara'
  | 'tenSeconds'
  | 'fardiga'
  | 'eld'
  /** A user-placed parti/delmoment boundary inside the shooting time. */
  | 'parti'
  /** The prolonged "Eld upphör!" call begins (T − 3 s) and ends at T. */
  | 'eldUpphor'
  | 'patronUr'
  | 'visitation';

/** `timeUp` is the tail of ELD UPPHÖR, not a command of its own — it carries no number. */
export type FaltCueKind = FaltCommandKind | 'timeUp';

/**
 * **Do not translate these, and do not move them into the i18n catalogues.**
 * Decided with the maintainer 2026-09-09: the commands stay Swedish in both
 * app languages, spoken and on screen, because they are what is actually
 * called on the line at a Swedish match — an English "Load!" would be wrong,
 * not helpful. The wording is SPSF-regulated (SHB D.6.2 p. 88) and is spoken
 * in sv-SE whatever the UI language is. Hard rule 5 still holds for the chrome
 * around them (screen title, buttons, settings labels), which is translated as
 * usual.
 */
/**
 * Spellings used only for speech, where the TTS voice mispronounces the real
 * command. The displayed text is always FALT_COMMAND_TEXT — these never reach
 * the screen.
 *
 * "Visitation" came out anglicised (maintainer, on device 2026-09-11:
 * "sounds like Swenglish"). Swedish "-tion" is the sje-ljud /ɧ/, so it is
 * respelled with "sch", which is unambiguous in Swedish orthography
 * (schack, dusch) and cannot be read the English way.
 */
export const FALT_COMMAND_SPEECH: Partial<Record<FaltCueKind, string>> = {
  visitation: 'Visitaschon!',
};

export const FALT_COMMAND_TEXT: Record<Exclude<FaltCommandKind, 'parti'>, string> = {
  ladda: 'Ladda!',
  allaKlara: 'Alla klara?',
  tenSeconds: 'Tio sekunder kvar!',
  fardiga: 'Färdiga!',
  eld: 'Eld!',
  eldUpphor: 'Eld upphör!',
  patronUr: 'Patron ur! Proppa vapen!',
  visitation: 'Visitation!',
};

/**
 * What to show (and speak) for one step. Swedish in both app languages: these
 * are the words actually called on the line at a Swedish match — see
 * `FALT_COMMAND_TEXT`. `timeUp` is the tail of the drawn-out ELD UPPHÖR and
 * carries its text.
 */
export function faltCommandText(cue: Pick<FaltCue, 'kind' | 'partiNumber'>): string {
  if (cue.kind === 'parti') return `Parti ${cue.partiNumber}`;
  if (cue.kind === 'timeUp') return FALT_COMMAND_TEXT.eldUpphor;
  return FALT_COMMAND_TEXT[cue.kind];
}

/** One step of the sequence: a numbered command, or the unnumbered `timeUp` marker. */
export interface FaltCue {
  kind: FaltCueKind;
  /** 1-based position in the on-screen numbered list; null for `timeUp`. */
  number: number | null;
  /** Seconds relative to ELD (t = 0), negative before it; null = untimed, given by a button press. */
  atSeconds: number | null;
  /** How long the call is drawn out: 3 s for ELD UPPHÖR so it ends exactly at T, 0 for everything else. */
  durationSeconds: number;
  /** Swedish command to speak; undefined for the wordless cues (`parti`, `timeUp`, the whistle variant). */
  speech?: string;
  /** Speech rate multiplier; only set where it differs from normal (the drawn-out ELD UPPHÖR). */
  speechRate?: number;
  /**
   * Overrides the host's kind-to-sound mapping. Only ELD UPPHÖR sets it, and
   * only in whistle mode: the blast *replaces* the words, so playing it beside
   * the spoken command would talk over it.
   */
  tone?: 'whistle';
  /** 1-based parti number, for `parti` cues only. */
  partiNumber?: number;
  /** A vibration point — ELD, each parti, and when the time is up. The host still gates on the user's setting. */
  vibrate: boolean;
}

export interface FaltTimerSettings {
  mode: FaltMode;
  /** LADDA → ALLA KLARA. Solo mode only; forced to 0 in range-officer mode, where LADDA is a button press. */
  laddaSeconds: number;
  shootingSeconds: number;
  /** Parti boundaries: whole seconds strictly inside the shooting window, ascending and unique. */
  partiSeconds: readonly number[];
  /** Replace the spoken "Eld upphör!" with a whistle-style tone (SHB: "kan ersättas med visselsignal"). */
  whistle: boolean;
  /** Vibrate at ELD, at each parti, and when the time is up. */
  vibration: boolean;
}

export const DEFAULT_FALT_SETTINGS: FaltTimerSettings = {
  mode: 'rangeOfficer',
  laddaSeconds: DEFAULT_LADDA_SECONDS,
  shootingSeconds: DEFAULT_SHOOTING_SECONDS,
  partiSeconds: [],
  whistle: false,
  vibration: true,
};

export interface FaltProgram {
  /** The settings the program was built from, normalized. */
  settings: FaltTimerSettings;
  /** Every numbered command, in the order it is given — the on-screen list. */
  commands: readonly FaltCue[];
  /** The button-press commands, in order. Empty in solo mode. */
  manualCues: readonly FaltCue[];
  /** The clock-driven cues, ascending, including the unnumbered `timeUp`. */
  cues: readonly FaltCue[];
  /** Where the clock starts: LADDA in solo mode, TIO SEKUNDER KVAR (−10) in range-officer mode. */
  startSeconds: number;
  /** VISITATION — the end of the program. */
  endSeconds: number;
}

function requireIntegerInRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
}

/** Validates and normalizes settings: sorts partier, zeroes an unused LADDA gap. */
export function normalizeFaltSettings(settings: FaltTimerSettings): FaltTimerSettings {
  requireIntegerInRange(
    settings.shootingSeconds,
    MIN_SHOOTING_SECONDS,
    MAX_SHOOTING_SECONDS,
    'shootingSeconds',
  );
  if (settings.mode === 'solo') {
    requireIntegerInRange(
      settings.laddaSeconds,
      MIN_LADDA_SECONDS,
      MAX_LADDA_SECONDS,
      'laddaSeconds',
    );
  }

  const partier = [...settings.partiSeconds].sort((a, b) => a - b);
  partier.forEach((second, i) => {
    if (!Number.isInteger(second) || second <= 0 || second >= settings.shootingSeconds) {
      throw new Error(
        `partiSeconds must be whole seconds strictly inside the shooting time (0 < t < ${settings.shootingSeconds})`,
      );
    }
    if (i > 0 && second === partier[i - 1]) throw new Error('partiSeconds must be unique');
  });

  return {
    mode: settings.mode,
    laddaSeconds: settings.mode === 'solo' ? settings.laddaSeconds : 0,
    shootingSeconds: settings.shootingSeconds,
    partiSeconds: partier,
    whistle: settings.whistle,
    vibration: settings.vibration,
  };
}

function command(
  kind: Exclude<FaltCommandKind, 'parti'>,
  atSeconds: number | null,
  vibrate = false,
): FaltCue {
  return {
    kind,
    number: 0, // assigned in build order below
    atSeconds,
    durationSeconds: 0,
    // Respelled where the voice needs it; the screen still shows the real
    // command (FALT_COMMAND_SPEECH).
    speech: FALT_COMMAND_SPEECH[kind] ?? FALT_COMMAND_TEXT[kind],
    vibrate,
  };
}

/**
 * Builds the program. Times are seconds relative to ELD; `null` marks the two
 * range-officer commands that wait for a press instead of the clock.
 */
export function buildFaltProgram(settings: FaltTimerSettings): FaltProgram {
  const normalized = normalizeFaltSettings(settings);
  const { mode, laddaSeconds, shootingSeconds, partiSeconds, whistle, vibration } = normalized;
  const manual = mode === 'rangeOfficer';

  const laddaAt = manual ? null : ALLA_KLARA_AT_SECONDS - laddaSeconds;
  const allaKlaraAt = manual ? null : ALLA_KLARA_AT_SECONDS;
  const eldUpphorAt = Math.max(0, shootingSeconds - ELD_UPPHOR_LEAD_SECONDS);
  const patronUrAt = shootingSeconds + PATRON_UR_DELAY_SECONDS;
  const visitationAt = patronUrAt + VISITATION_DELAY_SECONDS;

  const ordered: FaltCue[] = [
    command('ladda', laddaAt),
    command('allaKlara', allaKlaraAt),
    command('tenSeconds', -TEN_SECONDS_LEAD_SECONDS),
    command('fardiga', -FARDIGA_LEAD_SECONDS),
    command('eld', 0, vibration),
    ...partiSeconds.map<FaltCue>((second, i) => ({
      kind: 'parti',
      number: 0,
      atSeconds: second,
      durationSeconds: 0,
      partiNumber: i + 1,
      vibrate: vibration,
    })),
    {
      ...command('eldUpphor', eldUpphorAt),
      durationSeconds: ELD_UPPHOR_LEAD_SECONDS,
      // The whistle variant replaces the words entirely.
      speech: whistle ? undefined : FALT_COMMAND_TEXT.eldUpphor,
      speechRate: whistle ? undefined : ELD_UPPHOR_SPEECH_RATE,
      ...(whistle ? { tone: 'whistle' as const } : {}),
    },
    command('patronUr', patronUrAt),
    command('visitation', visitationAt),
  ];

  // Numbering follows the order the commands are given: the untimed presses
  // first, then everything the clock drives. A parti can fall after ELD UPPHÖR
  // has begun (e.g. a parti at 6 s of an 8 s time), so the timed ones are
  // sorted before numbering; the sort is stable, so a parti landing exactly on
  // T−3 keeps the lower number.
  const untimed = ordered.filter((cue) => cue.atSeconds === null);
  const timed = ordered
    .filter((cue) => cue.atSeconds !== null)
    .sort((a, b) => a.atSeconds! - b.atSeconds!);
  const commands = [...untimed, ...timed].map((cue, i) => ({ ...cue, number: i + 1 }));

  const timeUp: FaltCue = {
    kind: 'timeUp',
    number: null,
    atSeconds: shootingSeconds,
    durationSeconds: 0,
    vibrate: vibration,
  };

  const cues = [...commands.filter((cue) => cue.atSeconds !== null), timeUp].sort(
    (a, b) => a.atSeconds! - b.atSeconds!,
  );

  return {
    settings: normalized,
    commands,
    manualCues: commands.filter((cue) => cue.atSeconds === null),
    cues,
    startSeconds: manual ? -TEN_SECONDS_LEAD_SECONDS : laddaAt!,
    endSeconds: visitationAt,
  };
}

/**
 * Seconds between consecutive parti boundaries — the intervals shown on the
 * timeline: 0 → first parti, between partier, last parti → end of the
 * shooting time. With no partier this is just `[shootingSeconds]`.
 */
export function faltPartiIntervals(settings: FaltTimerSettings): readonly number[] {
  const { partiSeconds, shootingSeconds } = normalizeFaltSettings(settings);
  const bounds = [0, ...partiSeconds, shootingSeconds];
  return bounds.slice(1).map((second, i) => second - bounds[i]!);
}

export type FaltPhaseKind =
  | 'idle'
  /** Range officer: LADDA given, waiting for the "Alla klara" press. */
  | 'ladda'
  /** Range officer: ALLA KLARA given, waiting for the press that starts the clock. */
  | 'allaKlara'
  /** Solo: LADDA → ALLA KLARA. */
  | 'prep'
  /** ALLA KLARA → ELD. */
  | 'countdown'
  /** ELD → the end of the shooting time. */
  | 'shooting'
  /** After the shooting time: PATRON UR, VISITATION. */
  | 'clearing'
  /** The program has run out. */
  | 'done';

export interface FaltPhase {
  kind: FaltPhaseKind;
  /** ms relative to ELD, negative before it. Parked at the program's start until the clock runs. */
  atMs: number;
  /** ms until ELD; 0 once it has been given. */
  toEldMs: number;
  /** ms of shooting time left; 0 outside the shooting window. */
  shootingRemainingMs: number;
  /** Parti boundaries already passed, for the timeline highlight. */
  partierPassed: number;
}

/**
 * A cursor over a `FaltProgram`: `start()`, `advanceManual()`,
 * `advance(deltaMs)`, `pause()`, `resume()`, `reset()` are the only ways the
 * sequence moves, so the host owns the clock (a `setInterval` in the app,
 * fake time in tests).
 */
export class FaltTimerEngine {
  private readonly program: FaltProgram;
  private atMs: number;
  private nextCueIndex = 0;
  private manualGiven = 0;
  private running = false;
  private started = false;
  /** The clock has been let go at least once — what separates "paused" from "waiting for a press". */
  private clockStarted = false;

  constructor(settings: FaltTimerSettings = DEFAULT_FALT_SETTINGS) {
    this.program = buildFaltProgram(settings);
    this.atMs = this.program.startSeconds * 1_000;
  }

  getProgram(): FaltProgram {
    return this.program;
  }

  /**
   * idle → the first command. In range-officer mode that is LADDA, and the
   * clock does not run until `advanceManual()` has worked through the presses.
   * Throws if already started.
   */
  start(): readonly FaltCue[] {
    if (this.started) throw new Error('FaltTimerEngine.start() called twice');
    this.started = true;
    if (this.program.manualCues.length > 0) {
      this.manualGiven = 1;
      return [this.program.manualCues[0]!];
    }
    this.startClock();
    return this.collectCuesUpTo(this.atMs);
  }

  /**
   * The range officer's button: gives the next untimed command, or — once
   * they are all given — starts the clock. No-op in solo mode or once the
   * clock is running.
   */
  advanceManual(): readonly FaltCue[] {
    if (!this.started || this.clockStarted) return [];
    const pending = this.program.manualCues[this.manualGiven];
    if (pending) {
      this.manualGiven += 1;
      return [pending];
    }
    this.startClock();
    return this.collectCuesUpTo(this.atMs);
  }

  /** True while the sequence is waiting for `advanceManual()`. */
  isAwaitingPress(): boolean {
    return this.started && !this.clockStarted;
  }

  /** Advances the clock, returning every cue crossed, in order. No-op while paused or before the clock runs. */
  advance(deltaMs: number): readonly FaltCue[] {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('FaltTimerEngine.advance() requires deltaMs >= 0');
    }
    if (!this.running) return [];
    this.atMs = Math.min(this.program.endSeconds * 1_000, this.atMs + deltaMs);
    return this.collectCuesUpTo(this.atMs);
  }

  /** Holds the clock (the range officer stopping the series). */
  pause(): void {
    this.running = false;
  }

  resume(): void {
    // Only a paused *clock* resumes — a sequence still waiting for a press
    // stays there, otherwise Resume would skip the range officer's commands.
    if (this.clockStarted && !this.isFinished()) this.running = true;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** True while the clock is held — the only state a scrub is allowed in. */
  isPaused(): boolean {
    return this.clockStarted && !this.running;
  }

  /**
   * Moves the clock to `atMs` without firing anything.
   *
   * Scrubbing is navigation, not playback: seeking forward past ELD must not
   * shout every command it crossed, and seeking back must not re-arm them to
   * fire a second time. `nextCueIndex` is recomputed from the new position, so
   * whatever lies behind the playhead is spent and whatever lies ahead is not.
   *
   * Only while paused. Allowing it on a running clock would let a stray touch
   * move the series under the shooter, and the fälttimer is a command
   * sequence people are acting on.
   */
  seek(atMs: number): void {
    if (!Number.isFinite(atMs)) throw new Error('FaltTimerEngine.seek() requires a finite atMs');
    if (!this.isPaused()) return;

    this.atMs = Math.min(
      this.program.endSeconds * 1_000,
      Math.max(this.program.startSeconds * 1_000, atMs),
    );
    this.nextCueIndex = this.program.cues.filter(
      (cue) => cue.atSeconds! * 1_000 <= this.atMs,
    ).length;
  }

  /** Back to idle, discarding the run. */
  reset(): void {
    this.atMs = this.program.startSeconds * 1_000;
    this.nextCueIndex = 0;
    this.manualGiven = 0;
    this.running = false;
    this.started = false;
    this.clockStarted = false;
  }

  getAtMs(): number {
    return this.atMs;
  }

  getPhase(): FaltPhase {
    const { settings, manualCues } = this.program;
    const shootingMs = settings.shootingSeconds * 1_000;
    const at = this.atMs;

    let kind: FaltPhaseKind;
    if (!this.started) kind = 'idle';
    // Waiting for a press: the phase is simply the last command given.
    else if (!this.clockStarted)
      kind = manualCues[this.manualGiven - 1]!.kind === 'allaKlara' ? 'allaKlara' : 'ladda';
    else if (at < ALLA_KLARA_AT_SECONDS * 1_000) kind = 'prep';
    else if (at < 0) kind = 'countdown';
    else if (at < shootingMs) kind = 'shooting';
    else if (at < this.program.endSeconds * 1_000) kind = 'clearing';
    else kind = 'done';

    return {
      kind,
      atMs: at,
      toEldMs: Math.max(0, -at),
      shootingRemainingMs: at >= 0 ? Math.max(0, shootingMs - at) : 0,
      partierPassed: settings.partiSeconds.filter((second) => at >= second * 1_000).length,
    };
  }

  private startClock(): void {
    this.clockStarted = true;
    this.running = true;
  }

  private isFinished(): boolean {
    return this.atMs >= this.program.endSeconds * 1_000;
  }

  private collectCuesUpTo(atMs: number): readonly FaltCue[] {
    const due: FaltCue[] = [];
    while (this.nextCueIndex < this.program.cues.length) {
      const cue = this.program.cues[this.nextCueIndex]!;
      if (cue.atSeconds! * 1_000 > atMs) break;
      due.push(cue);
      this.nextCueIndex += 1;
    }
    return due;
  }
}
