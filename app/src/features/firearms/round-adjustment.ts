// Adjust Round Count form (#744): strict parsing in the style of the shared
// `parseRoundsFired`, and the note an adjustment event is stored with.
import { MAINTENANCE_INTERVAL_MONTHS_MAX } from '@shotledger/shared';

/** Whole digits with an optional sign; anything else, and zero, is refused. */
export function parseRoundAdjustment(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const delta = Number(trimmed);
  return Number.isSafeInteger(delta) && delta !== 0 ? delta : null;
}

/** Blank is no interval; whole positive digits are the interval. */
export function parseMaintenanceInterval(
  text: string,
): { ok: true; interval: number | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, interval: null };
  const interval = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(interval) && interval > 0
    ? { ok: true, interval }
    : { ok: false };
}

/** Blank is no time interval; whole months from 1 to MAINTENANCE_INTERVAL_MONTHS_MAX (#800). */
export function parseMaintenanceIntervalMonths(
  text: string,
): { ok: true; months: number | null } | { ok: false } {
  const parsed = parseMaintenanceInterval(text);
  if (!parsed.ok) return parsed;
  if (parsed.interval === null) return { ok: true, months: null };
  return parsed.interval <= MAINTENANCE_INTERVAL_MONTHS_MAX
    ? { ok: true, months: parsed.interval }
    : { ok: false };
}

export type RoundAdjustmentError = 'invalidDelta' | 'missingReason';

export function roundAdjustmentErrors(deltaText: string, reason: string): RoundAdjustmentError[] {
  const errors: RoundAdjustmentError[] = [];
  if (parseRoundAdjustment(deltaText) === null) errors.push('invalidDelta');
  if (reason.trim() === '') errors.push('missingReason');
  return errors;
}

/** "+10" / "−5" (U+2212). */
export function signedRounds(delta: number): string {
  return delta < 0 ? `−${-delta}` : `+${delta}`;
}

/**
 * The event has no amount column, so the amount the counter actually moved
 * by leads the stored note: "+10 · Club rental rounds".
 */
export function adjustmentNote(appliedDelta: number, reason: string): string {
  return `${signedRounds(appliedDelta)} · ${reason}`;
}
