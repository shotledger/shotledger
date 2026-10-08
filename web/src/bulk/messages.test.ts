import { describe, expect, it } from 'vitest';

import type { ApplyStatus } from './apply';
import { errorMessage, statusMessages } from './messages';

const SUMMARY = { changed: 3, unchanged: 0, missing: 0 };
const NAMES: Record<string, string> = { f1: 'Pistol A', f2: 'Pistol B' };
const name = (id: string) => NAMES[id] ?? null;
const at = (status: ApplyStatus) => statusMessages({ status, held: null }, name);
const keys = (status: ApplyStatus) => at(status).map((m) => m.key);
const applied = (overrides: object = {}): ApplyStatus => ({
  kind: 'applied',
  summary: SUMMARY,
  refused: 0,
  firearmsToCheck: [],
  tagGone: false,
  refreshed: true,
  ...overrides,
});

describe('what the page says', () => {
  it('a plain success says how many changed, and nothing else', () => {
    expect(at(applied())).toEqual([{ key: 'web.bulk.applied', params: { count: 3 } }]);
  });

  it('it counts the unchanged, the missing and the refused, then says reload when needed', () => {
    expect(
      at(
        applied({
          summary: { changed: 1, unchanged: 2, missing: 4 },
          refused: 5,
          refreshed: false,
        }),
      ),
    ).toEqual([
      { key: 'web.bulk.applied', params: { count: 1 } },
      { key: 'web.bulk.unchanged', params: { count: 2 } },
      { key: 'web.bulk.missing', params: { count: 4 } },
      { key: 'web.bulk.refused', params: { count: 5 } },
      { key: 'web.bulk.reload' },
    ]);
  });

  it('R25 a refused moved session names the firearms to check, by name; R6 a deleted tag is said', () => {
    expect(at(applied({ refused: 1, firearmsToCheck: ['f2', 'f1'] }))).toEqual([
      { key: 'web.bulk.applied', params: { count: 3 } },
      { key: 'web.bulk.refused', params: { count: 1 } },
      {
        key: 'web.bulk.checkRoundCounts',
        params: { count: 2 },
        firearms: ['Pistol B', 'Pistol A'],
      },
    ]);
    // A firearm the page has no row for is left out; none left, no line.
    expect(at(applied({ refused: 1, firearmsToCheck: ['f9', 'f1'] }))[2]).toEqual({
      key: 'web.bulk.checkRoundCounts',
      params: { count: 1 },
      firearms: ['Pistol A'],
    });
    expect(keys(applied({ refused: 1, firearmsToCheck: ['f9'] }))).toEqual([
      'web.bulk.applied',
      'web.bulk.refused',
    ]);
    expect(keys(applied({ tagGone: true }))).toEqual(['web.bulk.applied', 'web.bulk.tagGone']);
  });

  it('a failure says why', () => {
    expect(keys({ kind: 'failed', error: 'network' })).toEqual(['web.bulk.failedNetwork']);
    expect(keys({ kind: 'failed', error: 'unauthenticated' })).toEqual([
      'web.bulk.failedSignedOut',
    ]);
    expect(keys({ kind: 'failed', error: 'versionUnsupported' })).toEqual([
      'web.bulk.failedOutdated',
    ]);
    expect(keys({ kind: 'failed', error: 'unknown' })).toEqual(['web.entry.failed']);
    // R14: an unconfirmed answer is said as such.
    expect(keys({ kind: 'failed', error: 'unknown', unconfirmed: true })).toEqual([
      'web.bulk.failedUnconfirmed',
    ]);
  });

  it('applying, idle, another account and invalid', () => {
    expect(keys({ kind: 'applying' })).toEqual(['web.bulk.applying']);
    expect(keys({ kind: 'accountChanged', userId: 'u2' })).toEqual(['web.bulk.accountChanged']);
    expect(keys({ kind: 'idle' })).toEqual([]);
    expect(
      at({ kind: 'invalid', errors: [{ kind: 'blankTag' }, { kind: 'nothingToChange' }] }),
    ).toEqual([{ key: 'web.bulk.errorBlankTag' }, { key: 'web.bulk.errorNothing' }]);
  });

  it('every builder error has its message', () => {
    expect(errorMessage({ kind: 'noSessions' })).toEqual({ key: 'web.bulk.errorNoSessions' });
    expect(errorMessage({ kind: 'unknownFirearm' })).toEqual({
      key: 'web.entry.errorUnknownFirearm',
    });
    expect(errorMessage({ kind: 'tooLong', field: 'tag', max: 120 })).toEqual({
      key: 'web.entry.errorTooLong',
      params: { max: 120 },
      fieldKey: 'web.bulk.tag',
    });
    expect(errorMessage({ kind: 'tooLong', field: 'location', max: 200 }).fieldKey).toBe(
      'session.location',
    );
    expect(errorMessage({ kind: 'tooManyChanges', max: 500, needed: 612 })).toEqual({
      key: 'web.bulk.errorTooMany',
      params: { needed: 612, max: 500 },
    });
  });
});
