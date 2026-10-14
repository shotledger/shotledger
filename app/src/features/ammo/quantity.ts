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
