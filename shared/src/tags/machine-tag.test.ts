import { describe, expect, it } from 'vitest';

import { isMachineTag, partitionTags } from './machine-tag';

describe('isMachineTag', () => {
  it.each([
    'shotlog:review',
    'shotlog:date-unknown',
    'shotledger:level=forening',
    'shotledger:championship',
    'shotlog:00000000deadbeef',
  ])('treats %s as machine metadata', (name) => {
    expect(isMachineTag(name)).toBe(true);
  });

  it.each([
    'Träning',
    'match load',
    'PB',
    // A colon the shooter typed: the segment before it is not a bare
    // lowercase identifier, so it stays their tag.
    '9mm: match load',
    'Klubb: Malmö',
    ':leading-colon',
    'no-colon-at-all',
  ])('leaves %s as the shooter’s own', (name) => {
    expect(isMachineTag(name)).toBe(false);
  });
});

describe('partitionTags', () => {
  it('splits both kinds and keeps the given order', () => {
    expect(partitionTags(['PB', 'shotlog:review', 'Träning', 'shotledger:championship'])).toEqual({
      own: ['PB', 'Träning'],
      machine: ['shotlog:review', 'shotledger:championship'],
    });
  });

  it('returns empty lists for no tags', () => {
    expect(partitionTags([])).toEqual({ own: [], machine: [] });
  });
});
