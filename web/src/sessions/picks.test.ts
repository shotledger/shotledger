import { describe, expect, it } from 'vitest';

import { addPicks, NO_PICKS, picksOf, removePick, togglePick, withPicks } from './picks';

describe('picks', () => {
  const account = {};

  it('starts empty and keeps the picks of the account that made them', () => {
    expect(picksOf(NO_PICKS, account)).toEqual([]);
    const picks = withPicks(account, ['a', 'b']);
    expect(picksOf(picks, account)).toEqual(['a', 'b']);
  });

  it('shows none once another account is loaded', () => {
    const picks = withPicks(account, ['a']);
    expect(picksOf(picks, {})).toEqual([]);
  });

  it('toggles in pick order', () => {
    expect(togglePick(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('adds only the ones not picked yet, keeping the order', () => {
    expect(addPicks(['b'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('removes one', () => {
    expect(removePick(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});
