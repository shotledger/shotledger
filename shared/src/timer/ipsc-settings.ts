// The IPSC timer's settings, as they are stored. Kept here rather than in the
// screen so the values that come back out of the settings table are validated
// before they reach the engine, the same way the fälttimer's are.
import {
  MAX_TRIGGER_DB,
  MIN_TRIGGER_DB,
  SENSITIVITY_THRESHOLD_DB,
  type IpscTimerConfig,
} from './shot-detector';

/** Longest start delay the screen's slider offers — past this a random wait stops being a start signal. */
export const IPSC_DELAY_MAX_SECONDS = 10;

export interface IpscTimerSettings {
  /** dBFS trigger level for the shot detector (MIN_TRIGGER_DB … MAX_TRIGGER_DB). */
  thresholdDb: number;
  /** Random start delay, the two ends of the range slider. */
  delayMinSeconds: number;
  delayMaxSeconds: number;
  /** PAR time; 0 = no PAR. */
  parSeconds: number;
  /** Auto-stop after this much silence; 0 = manual stop only (see IpscTimerConfig). */
  autoStopSeconds: number;
}

export const DEFAULT_IPSC_SETTINGS: IpscTimerSettings = {
  thresholdDb: SENSITIVITY_THRESHOLD_DB.medium,
  delayMinSeconds: 1,
  delayMaxSeconds: 4,
  parSeconds: 0,
  autoStopSeconds: 10,
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
    thresholdDb: number(
      stored.thresholdDb,
      MIN_TRIGGER_DB,
      MAX_TRIGGER_DB,
      DEFAULT_IPSC_SETTINGS.thresholdDb,
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
  };
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
    thresholdDb: normalized.thresholdDb,
  };
}
