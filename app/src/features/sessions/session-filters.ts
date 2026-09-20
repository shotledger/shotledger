// Pure filtering for the full sessions list (#317). No DB import, so it is
// jest-unit-testable without the native expo-sqlite client — same rule as
// home-session-row.ts.
import type { SessionListRow } from './session-list-row';

export interface SessionListFilter {
  /** Free text, matched against the session name. Case- and accent-insensitive. */
  query: string;
  type: 'all' | 'training' | 'competition';
  /** Discipline id, or `'all'`. */
  disciplineId: string;
  /** Tag **name**, or `'all'`. Names, not ids — ids mean nothing to a shooter. */
  tag: string;
  /** Firearm id, `'all'`, or `'none'` for sessions with no firearm recorded. */
  firearmId: string;
}

export const EMPTY_SESSION_FILTER: SessionListFilter = {
  query: '',
  type: 'all',
  disciplineId: 'all',
  tag: 'all',
  firearmId: 'all',
};

/**
 * Folds case and diacritics so a search for "malmo" finds "Malmö".
 *
 * A Swedish shooter types å/ä/ö without thinking, but an imported session name
 * may carry either form of the same character (NFC vs NFD) depending on where
 * it came from — so matching the raw strings drops rows for no reason a user
 * could see.
 */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

export function filterSessionRows(
  rows: readonly SessionListRow[],
  filter: SessionListFilter,
): SessionListRow[] {
  const needle = fold(filter.query.trim());

  return rows.filter((row) => {
    if (needle && !fold(row.name).includes(needle)) return false;
    if (filter.type !== 'all' && row.type !== filter.type) return false;
    if (filter.disciplineId !== 'all' && row.disciplineId !== filter.disciplineId) return false;
    if (filter.tag !== 'all' && !row.tags.includes(filter.tag)) return false;
    if (filter.firearmId === 'none') {
      if (row.firearmId !== null) return false;
    } else if (filter.firearmId !== 'all' && row.firearmId !== filter.firearmId) {
      return false;
    }
    return true;
  });
}

/** Whether anything is narrowing the list — drives the "Clear filters" affordance. */
export function isFilterActive(filter: SessionListFilter): boolean {
  return (
    filter.query.trim() !== '' ||
    filter.type !== 'all' ||
    filter.disciplineId !== 'all' ||
    filter.tag !== 'all' ||
    filter.firearmId !== 'all'
  );
}
