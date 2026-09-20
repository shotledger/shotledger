import { describe, expect, it } from 'vitest';

import {
  mergeLocationUsage,
  normalizeLocation,
  rankRecentLocations,
  type LocationUsage,
} from './recent-locations';

const usage = (location: string, count: number, lastUsedAt: string): LocationUsage => ({
  location,
  count,
  lastUsedAt,
});

describe('normalizeLocation', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeLocation('  Malmö   Skyttegille \n')).toBe('Malmö Skyttegille');
  });

  it('reduces a blank string to empty', () => {
    expect(normalizeLocation('   ')).toBe('');
  });
});

describe('mergeLocationUsage', () => {
  it('merges case/whitespace variants and keeps the newest spelling', () => {
    expect(
      mergeLocationUsage([
        usage('skjutbanan', 2, '2026-01-01T10:00:00Z'),
        usage('Skjutbanan ', 1, '2026-05-01T10:00:00Z'),
      ]),
    ).toEqual([usage('Skjutbanan', 3, '2026-05-01T10:00:00Z')]);
  });

  it('keeps the older spelling when the older row is the newer one on merge order', () => {
    expect(
      mergeLocationUsage([
        usage('Skjutbanan', 1, '2026-05-01T10:00:00Z'),
        usage('skjutbanan', 2, '2026-01-01T10:00:00Z'),
      ]),
    ).toEqual([usage('Skjutbanan', 3, '2026-05-01T10:00:00Z')]);
  });

  it('drops blank locations', () => {
    expect(mergeLocationUsage([usage('   ', 4, '2026-05-01T10:00:00Z')])).toEqual([]);
  });
});

describe('rankRecentLocations', () => {
  const rows = [
    usage('Skjutbanan Norr', 1, '2026-08-01T10:00:00Z'),
    usage('Malmö Skyttegille', 9, '2026-02-01T10:00:00Z'),
    usage('Skjutbanan Söder', 1, '2026-09-01T10:00:00Z'),
  ];

  it('offers the most recent first when nothing is typed', () => {
    expect(rankRecentLocations(rows, '', 5)).toEqual([
      'Skjutbanan Söder',
      'Skjutbanan Norr',
      'Malmö Skyttegille',
    ]);
  });

  it('ranks prefix matches above substring matches even when the latter is newer', () => {
    const withNewerSubstringMatch = [...rows, usage('Kretsbanan Sk', 20, '2026-12-24T10:00:00Z')];
    expect(rankRecentLocations(withNewerSubstringMatch, 'sk')).toEqual([
      'Skjutbanan Söder',
      'Skjutbanan Norr',
      'Kretsbanan Sk',
      'Malmö Skyttegille',
    ]);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(rankRecentLocations(rows, '  MALMÖ ')).toEqual(['Malmö Skyttegille']);
  });

  it('breaks a recency tie on usage count, then alphabetically', () => {
    const sameDay = [
      usage('Bravo', 1, '2026-09-01T10:00:00Z'),
      usage('Alfa', 1, '2026-09-01T10:00:00Z'),
      usage('Charlie', 7, '2026-09-01T10:00:00Z'),
    ];
    expect(rankRecentLocations(sameDay)).toEqual(['Charlie', 'Alfa', 'Bravo']);
  });

  it('never suggests what the user has already typed in full', () => {
    expect(rankRecentLocations(rows, 'Skjutbanan Söder')).toEqual([]);
  });

  it('honors the limit', () => {
    expect(rankRecentLocations(rows, '', 2)).toEqual(['Skjutbanan Söder', 'Skjutbanan Norr']);
    expect(rankRecentLocations(rows, '', 0)).toEqual([]);
  });

  it('returns nothing when no recent location matches', () => {
    expect(rankRecentLocations(rows, 'zzz')).toEqual([]);
  });
});
