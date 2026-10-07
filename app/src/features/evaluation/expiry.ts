// Expiry of an evaluation build (EXPO_PUBLIC_EVAL_EXPIRES_AT). An honest-user
// gate, not enforcement: the high-water mark stops a clock set back from
// reopening the window, but wiping the app's data first, or patching the
// bundle, still beats it.

/** `YYYY-MM-DD` (midnight UTC) or a full ISO 8601 date-time with `Z` or an offset. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** The expiry instant in epoch ms, or `null` when unset or malformed. */
export function parseExpiresAt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

export type EvaluationStatus =
  /** Not an evaluation build, or the date is malformed: no gate (fail open). */
  | { kind: 'none' }
  | { kind: 'active'; expiresAt: number; highWaterMark: number }
  | { kind: 'expired'; expiresAt: number; highWaterMark: number };

/**
 * Decides whether the build has expired. Time never runs backwards here:
 * `highWaterMark` is the latest clock reading ever seen, and the result
 * carries the new one for the caller to persist.
 */
export function evaluateEvaluationWindow(input: {
  expiresAt: string | undefined;
  now: number;
  highWaterMark: number | null;
}): EvaluationStatus {
  const expiresAt = parseExpiresAt(input.expiresAt);
  if (expiresAt === null) return { kind: 'none' };
  const seen =
    input.highWaterMark !== null && Number.isFinite(input.highWaterMark) ? input.highWaterMark : 0;
  const highWaterMark = Math.max(input.now, seen);
  return {
    kind: highWaterMark >= expiresAt ? 'expired' : 'active',
    expiresAt,
    highWaterMark,
  };
}
