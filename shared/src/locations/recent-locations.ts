// Ranking for the new-session Location field's offline autocomplete: the
// places this shooter has already typed, ordered so the range they were at
// last week beats the one they visited once two years ago.

/** One distinct location string with how often and how recently it was used. */
export interface LocationUsage {
  location: string;
  /** Sessions carrying this location (non-deleted). */
  count: number;
  /** ISO-8601 `started_at` of the most recent session with this location. */
  lastUsedAt: string;
}

/** Trimmed, inner whitespace collapsed. Empty string when there is nothing left. */
export function normalizeLocation(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Merges rows that differ only in case or whitespace, keeping the spelling of
 * the most recently used one — the user's latest choice is the one they meant.
 */
export function mergeLocationUsage(rows: readonly LocationUsage[]): LocationUsage[] {
  const byKey = new Map<string, LocationUsage>();
  for (const row of rows) {
    const location = normalizeLocation(row.location);
    if (location === '') continue;
    const key = location.toLocaleLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { location, count: row.count, lastUsedAt: row.lastUsedAt });
      continue;
    }
    const newer = row.lastUsedAt > existing.lastUsedAt;
    byKey.set(key, {
      location: newer ? location : existing.location,
      count: existing.count + row.count,
      lastUsedAt: newer ? row.lastUsedAt : existing.lastUsedAt,
    });
  }
  return [...byKey.values()];
}

/**
 * Suggestions for `query`, best first.
 *
 * Order: entries starting with the query beat entries merely containing it
 * (typing "sk" should offer "Skjutbanan" before "Malmö Skyttegille"); within a
 * tier, most recently used first, then most used, then alphabetically so the
 * list never reorders itself between two equally-good candidates. An empty
 * query offers the recents unfiltered.
 */
export function rankRecentLocations(
  rows: readonly LocationUsage[],
  query = '',
  limit = 5,
): string[] {
  if (limit <= 0) return [];
  const needle = normalizeLocation(query).toLocaleLowerCase();
  const scored: { row: LocationUsage; tier: number }[] = [];

  for (const row of mergeLocationUsage(rows)) {
    const haystack = row.location.toLocaleLowerCase();
    if (needle === '') {
      scored.push({ row, tier: 0 });
      continue;
    }
    // An exact match adds nothing the user hasn't already typed.
    if (haystack === needle) continue;
    if (haystack.startsWith(needle)) scored.push({ row, tier: 0 });
    else if (haystack.includes(needle)) scored.push({ row, tier: 1 });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.row.lastUsedAt !== b.row.lastUsedAt) return a.row.lastUsedAt < b.row.lastUsedAt ? 1 : -1;
    if (a.row.count !== b.row.count) return b.row.count - a.row.count;
    return a.row.location.localeCompare(b.row.location);
  });

  return scored.slice(0, limit).map((entry) => entry.row.location);
}
