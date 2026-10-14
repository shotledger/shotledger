import { REAL_MAX, REAL_MIN } from '@shotledger/shared';

/**
 * A lot's quantity as typed: whole digits, or null for blank or anything
 * else. The column is an integer, and the sync server refuses a fraction in
 * it (docs/specs/sync-payload-validation-spec.md), so `12.5` is not stored.
 */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  const quantity = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(quantity) ? quantity : null;
}

/**
 * A measured value as typed (bullet weight, velocity, powder charge, COL,
 * crimp), or null for blank, unreadable, or outside what the sync server
 * accepts in a real column (`REAL_MIN`..`REAL_MAX`), so a typo like `1e15`
 * is not stored.
 */
export function parseMeasure(text: string): number | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value >= REAL_MIN && value <= REAL_MAX
    ? value
    : null;
}
