// The IPSC timer's settings, as they are stored. Kept here rather than in the
// screen so the values that come back out of the settings table are validated
// before they reach the engine, the same way the fälttimer's are.
import {
  DEFAULT_TIMER_CUE_MODE,
  normalizeTimerCueMode,
  resolveTimerCue,
  type TimerCueDelivery,
  type TimerCueMode,
} from './cue-settings';
import {
  MAX_EVENT_MS,
  MAX_TRIGGER_EXCESS_DB,
  MIN_EVENT_MS,
  MIN_TRIGGER_EXCESS_DB,
  SENSITIVITY_PRESETS,
  type IpscCueKind,
  type IpscTimerConfig,
} from './shot-detector';

/** Longest start delay the screen's slider offers — past this a random wait stops being a start signal. */
export const IPSC_DELAY_MAX_SECONDS = 10;

export interface IpscTimerSettings {
  /** How far over the room a sound must rise to be considered (MIN/MAX_TRIGGER_EXCESS_DB). */
  triggerExcessDb: number;
  /** Longest event still counted as a shot, in ms (MIN/MAX_EVENT_MS). */
  maxEventMs: number;
  /** Random start delay, the two ends of the range slider. */
  delayMinSeconds: number;
  delayMaxSeconds: number;
  /** PAR time; 0 = no PAR. */
  parSeconds: number;
  /** Auto-stop after this much silence; 0 = manual stop only (see IpscTimerConfig). */
  autoStopSeconds: number;
  /** How every cue is delivered — one choice for all four, as on the Time Limit timer. */
  cueMode: TimerCueMode;
  /** Speak the ready and standby prompts instead of beeping them. */
  spokenPrompts: boolean;
}

export const DEFAULT_IPSC_SETTINGS: IpscTimerSettings = {
  triggerExcessDb: SENSITIVITY_PRESETS.medium.triggerExcessDb,
  maxEventMs: SENSITIVITY_PRESETS.medium.maxEventMs,
  delayMinSeconds: 1,
  delayMaxSeconds: 4,
  parSeconds: 0,
  autoStopSeconds: 10,
  cueMode: DEFAULT_TIMER_CUE_MODE,
  spokenPrompts: true,
};

function number(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

/**
 * Validates a stored blob field by field. A bad field falls back to its
 * default instead of throwing: no single out-of-range number should cost the
 * user the rest of their settings, and the engine rejects the whole config if
 * one reaches it.
 */
export function normalizeIpscSettings(value: unknown): IpscTimerSettings {
  const stored = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const delayMinSeconds = number(
    stored.delayMinSeconds,
    0,
    IPSC_DELAY_MAX_SECONDS,
    DEFAULT_IPSC_SETTINGS.delayMinSeconds,
  );
  return {
    triggerExcessDb: number(
      stored.triggerExcessDb,
      MIN_TRIGGER_EXCESS_DB,
      MAX_TRIGGER_EXCESS_DB,
      DEFAULT_IPSC_SETTINGS.triggerExcessDb,
    ),
    maxEventMs: number(
      stored.maxEventMs,
      MIN_EVENT_MS,
      MAX_EVENT_MS,
      DEFAULT_IPSC_SETTINGS.maxEventMs,
    ),
    delayMinSeconds,
    // The high thumb can never sit below the low one, whatever was stored.
    delayMaxSeconds: number(
      stored.delayMaxSeconds,
      delayMinSeconds,
      IPSC_DELAY_MAX_SECONDS,
      Math.max(delayMinSeconds, DEFAULT_IPSC_SETTINGS.delayMaxSeconds),
    ),
    parSeconds: number(
      stored.parSeconds,
      0,
      Number.MAX_SAFE_INTEGER,
      DEFAULT_IPSC_SETTINGS.parSeconds,
    ),
    autoStopSeconds: number(
      stored.autoStopSeconds,
      0,
      Number.MAX_SAFE_INTEGER,
      DEFAULT_IPSC_SETTINGS.autoStopSeconds,
    ),
    cueMode: normalizeTimerCueMode(stored.cueMode),
    spokenPrompts:
      typeof stored.spokenPrompts === 'boolean'
        ? stored.spokenPrompts
        : DEFAULT_IPSC_SETTINGS.spokenPrompts,
  };
}

/**
 * How one cue is delivered. Only the ready and standby prompts can be spoken:
 * the start beep and the stop tone stay tones, because a spoken word arrives
 * late and blurs the moment the clock actually starts.
 */
export function ipscCueDelivery(
  settings: Pick<IpscTimerSettings, 'cueMode' | 'spokenPrompts'>,
  cue: IpscCueKind,
): TimerCueDelivery {
  const spoken = settings.spokenPrompts && (cue === 'ready' || cue === 'standby');
  return resolveTimerCue(settings.cueMode, spoken ? 'voice' : 'beep');
}

/** The engine config these settings describe. */
export function ipscConfigFromSettings(
  settings: IpscTimerSettings,
  readyMs: number,
): IpscTimerConfig {
  const normalized = normalizeIpscSettings(settings);
  return {
    readyMs,
    randomDelay: {
      minMs: Math.round(normalized.delayMinSeconds * 1_000),
      maxMs: Math.round(normalized.delayMaxSeconds * 1_000),
    },
    parMs: normalized.parSeconds > 0 ? Math.round(normalized.parSeconds * 1_000) : undefined,
    autoStopSilenceMs: Math.round(normalized.autoStopSeconds * 1_000),
    triggerExcessDb: normalized.triggerExcessDb,
    maxEventMs: normalized.maxEventMs,
  };
}
