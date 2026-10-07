// Kept free of react-native so the web app prints shots the same way.
import type { EntryShot } from '@shotledger/shared';

/**
 * Chip text (spec Amendment A2 §A2.3). An inner ten is the only shot that
 * does not print as a plain number: integer mode prints `X`, decimal mode
 * parenthesises the value, so `(10.9)` is a centrumtia and `10.9` is not.
 */
export function formatShotValue(shot: EntryShot | null, mode: 'integer' | 'decimal'): string {
  if (!shot) return '–';
  if (mode === 'decimal') {
    const value = (shot.valueTenths / 10).toFixed(1);
    return shot.isInnerTen ? `(${value})` : value;
  }
  if (shot.isInnerTen) return 'X';
  return String(shot.valueTenths / 10);
}
