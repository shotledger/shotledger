import { describe, expect, it } from 'vitest';

import { buildDefaultTagMapping, collectShotlogTags, defaultTagRole, normalizeTag } from './tags';
import type { ShotlogRow } from './types';

function row(tags: readonly string[], line = 2): ShotlogRow {
  return {
    line,
    datetime: '2026-05-04T09:00:00Z',
    name: '',
    sourceType: 'Practice',
    totalScore: 0,
    tenCount: 0,
    innerTenCount: 0,
    tags: [...tags],
    note: '',
    warnings: [],
  };
}

describe('normalizeTag', () => {
  it.each([
    ['  Precision  ', 'precision'],
    ['A   Opt', 'a opt'],
    ['TÄVLING', 'tävling'],
    ['', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeTag(input)).toBe(expected);
  });
});

describe('defaultTagRole', () => {
  it('reads a discipline off the registry name, in either language', () => {
    expect(defaultTagRole('Precision')).toEqual({
      kind: 'discipline',
      disciplineId: 'spsf-precision',
    });
    expect(defaultTagRole('Military Rapid Fire')).toEqual({
      kind: 'discipline',
      disciplineId: 'spsf-milsnabb',
    });
    expect(defaultTagRole('Militär snabbmatch')).toEqual({
      kind: 'discipline',
      disciplineId: 'spsf-milsnabb',
    });
  });

  it.each([
    ['milsnabb', 'spsf-milsnabb'],
    ['Mil', 'spsf-milsnabb'],
    ['prec', 'spsf-precision'],
  ])('accepts the common abbreviation %j', (tag, disciplineId) => {
    expect(defaultTagRole(tag)).toEqual({ kind: 'discipline', disciplineId });
  });

  it.each([
    ['Tävling', 'competition'],
    ['tavling', 'competition'],
    ['Competition', 'competition'],
    ['Warmup', 'sighter'],
    ['provskott', 'sighter'],
    ['Final', 'final'],
    ['DNF', 'dnf'],
  ])('reads %j as the %s role', (tag, kind) => {
    expect(defaultTagRole(tag).kind).toBe(kind);
  });

  it.each(['A', 'B', 'C', 'R', 'c'])('reads the bare group code %j as a weapon group', (tag) => {
    expect(defaultTagRole(tag)).toEqual({
      kind: 'weapon-group',
      weaponGroup: `spsf:${tag.toUpperCase()}`,
      shooterClass: null,
    });
  });

  it.each(['A Opt', 'a-opt', 'AOPT'])('reads %j as the optics group, not a firearm', (tag) => {
    expect(defaultTagRole(tag)).toEqual({
      kind: 'weapon-group',
      weaponGroup: 'spsf:A-opt',
      shooterClass: null,
    });
  });

  it.each([
    ['C1', 'spsf:C', '1'],
    ['B 2', 'spsf:B', '2'],
    ['A Opt 3', 'spsf:A-opt', '3'],
  ])('reads %j as a group plus a shooter class', (tag, weaponGroup, shooterClass) => {
    expect(defaultTagRole(tag)).toEqual({ kind: 'weapon-group', weaponGroup, shooterClass });
  });

  it('does not read a class digit outside 1-3 as a class', () => {
    expect(defaultTagRole('C4')).toEqual({ kind: 'firearm', label: 'C4' });
  });

  it('does not turn a trailing 1-3 into a class when the rest is not a group', () => {
    expect(defaultTagRole('Pistol 1')).toEqual({ kind: 'firearm', label: 'Pistol 1' });
  });

  it('guesses anything else as a firearm, keeping the tag trimmed', () => {
    expect(defaultTagRole('  Pistol One  ')).toEqual({ kind: 'firearm', label: 'Pistol One' });
  });

  it('ignores an empty tag', () => {
    expect(defaultTagRole('   ')).toEqual({ kind: 'ignore' });
  });
});

describe('collectShotlogTags', () => {
  it('returns nothing for rows with no tags', () => {
    expect(collectShotlogTags([row([])])).toEqual([]);
  });

  it('counts each distinct tag once per row that carries it', () => {
    const usage = collectShotlogTags([row(['Precision', 'Tävling']), row(['Precision'], 3)]);
    expect(usage).toEqual([
      { key: 'precision', label: 'Precision', count: 2 },
      { key: 'tävling', label: 'Tävling', count: 1 },
    ]);
  });

  it('folds case and spacing into one entry, keeping the first spelling', () => {
    const usage = collectShotlogTags([row([' A  Opt ']), row(['a opt'], 3)]);
    expect(usage).toEqual([{ key: 'a opt', label: 'A  Opt', count: 2 }]);
  });

  it('skips a blank tag', () => {
    expect(collectShotlogTags([row(['   ', 'Precision'])])).toEqual([
      { key: 'precision', label: 'Precision', count: 1 },
    ]);
  });

  it('orders by count, then alphabetically', () => {
    const usage = collectShotlogTags([
      row(['b', 'a', 'rare']),
      row(['b', 'a'], 3),
      row(['b', 'a'], 4),
    ]);
    expect(usage.map((entry) => entry.key)).toEqual(['a', 'b', 'rare']);
  });
});

describe('buildDefaultTagMapping', () => {
  it('gives every distinct tag its default role, keyed by the normalized tag', () => {
    expect(buildDefaultTagMapping([row(['Precision', 'Tävling', 'Pistol One'])])).toEqual({
      precision: { kind: 'discipline', disciplineId: 'spsf-precision' },
      tävling: { kind: 'competition' },
      'pistol one': { kind: 'firearm', label: 'Pistol One' },
    });
  });

  it('is empty for a file with no tags at all', () => {
    expect(buildDefaultTagMapping([row([])])).toEqual({});
  });
});
