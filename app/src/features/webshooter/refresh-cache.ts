// Remembering what we already fetched, and when.
//
// The start list and the import scan each cost one request per competition,
// against someone else's server. Refreshing them every time a screen came
// into view was polite enough with a TTL cache while the app stayed open,
// and not polite at all across restarts: the in-memory cache dies with the
// process, so every cold start re-walked the whole season.
//
// So the rule is now the maintainer's: fetch when there is nothing, and
// otherwise show what we have with the time it was fetched, leaving the
// decision to refresh to the person who knows whether anything changed.
import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';

export interface CachedFetch<T> {
  /** ISO instant of the fetch that produced `data`. */
  fetchedAt: string;
  data: T;
}

function key(name: string): string {
  return `webshooterCache:${name}`;
}

export function readCache<T>(name: string): CachedFetch<T> | null {
  if (!db) return null;
  const raw = getSetting<string | null>(db, key(name), null);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'fetchedAt' in parsed &&
      'data' in parsed
    ) {
      return parsed as CachedFetch<T>;
    }
  } catch {
    // Written by a build with a different shape, or truncated. Treated as
    // absent, which means one refetch rather than a crash.
    return null;
  }
  return null;
}

export function writeCache<T>(name: string, data: T): string {
  const fetchedAt = new Date().toISOString();
  if (db) setSetting<string>(db, key(name), JSON.stringify({ fetchedAt, data }));
  return fetchedAt;
}

export function clearCache(name: string): void {
  if (db) setSetting<string | null>(db, key(name), null);
}

/**
 * `2026-09-12 08:15` in local time — absolute, not "3 hours ago".
 *
 * The question this answers is "is this from before or after the organiser
 * published the draw", and a relative age makes the reader do arithmetic to
 * get back to the wall clock they actually care about.
 */
export function formatFetchedAt(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}
