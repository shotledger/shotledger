// Pure filtering for the full sessions list (#317). No DB import, so it is
// jest-unit-testable without the native expo-sqlite client — same rule as
// home-session-row.ts.
import type { SessionListRow } from './session-list-row';
import { localDayEndIso, localDayStartIso } from '@/features/dates/local-day';

/**
 * The date range, in the same vocabulary the Statistics tab uses — one set of
 * words for "when" across the app, so the two screens cannot drift apart.
 */
export const SESSION_PERIODS = ['all', '30d', '6m', '12m', 'custom'] as const;
export type SessionPeriod = (typeof SESSION_PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<SessionPeriod, 'all' | 'custom'>, number> = {
  '30d': 30,
  '6m': 182,
  '12m': 365,
};

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
  /** Date range. `'all'` is no bound; `'custom'` uses the two dates below. */
  period: SessionPeriod;
  /** 'YYYY-MM-DD', only meaningful when `period === 'custom'`. */
  customFrom: string | null;
  customTo: string | null;
}

/**
 * The [from, to] bounds a period resolves to; `null` is unbounded.
 *
 * A custom range with only one end set bounds only that end, rather than
 * matching nothing — half a range is a range, and a screen that silently
 * showed zero rows while the user was still picking the second date would
 * look broken.
 */
export function sessionPeriodRange(
  filter: Pick<SessionListFilter, 'period' | 'customFrom' | 'customTo'>,
  now: Date = new Date(),
): { fromIso: string | null; toIso: string | null } {
  if (filter.period === 'all') return { fromIso: null, toIso: null };
  if (filter.period === 'custom') {
    return {
      fromIso: filter.customFrom ? localDayStartIso(filter.customFrom) : null,
      toIso: filter.customTo ? localDayEndIso(filter.customTo) : null,
    };
  }
  return {
    fromIso: new Date(now.getTime() - PERIOD_DAYS[filter.period] * DAY_MS).toISOString(),
    toIso: null,
  };
}

export const EMPTY_SESSION_FILTER: SessionListFilter = {
  query: '',
  type: 'all',
  disciplineId: 'all',
  tag: 'all',
  firearmId: 'all',
  period: 'all',
  customFrom: null,
  customTo: null,
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
  now: Date = new Date(),
): SessionListRow[] {
  const needle = fold(filter.query.trim());
  const { fromIso, toIso } = sessionPeriodRange(filter, now);

  return rows.filter((row) => {
    if (fromIso !== null && row.startedAt < fromIso) return false;
    if (toIso !== null && row.startedAt > toIso) return false;
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
    filter.firearmId !== 'all' ||
    filter.period !== 'all'
  );
}
