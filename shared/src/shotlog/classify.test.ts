import { describe, expect, it } from 'vitest';

import { classifyTags, suggestDisciplineFromName, suggestWeaponGroupFromName } from './classify';

const FIREARMS = [
  { id: 'f1', label: 'Pistol One' },
  { id: 'f2', label: 'Revolver Two' },
];

describe('classifyTags', () => {
  it('defaults to a training session with nothing resolved', () => {
    expect(classifyTags([])).toEqual({
      sessionType: 'training',
      disciplineId: null,
      includesWarmup: false,
      hasFinal: false,
      dnf: false,
      weaponGroupHint: null,
      firearmMatch: null,
      passthroughTags: [],
      warnings: [],
    });
  });

  it('maps the whole known vocabulary', () => {
    const result = classifyTags(['Tävling', 'Precision', 'Warmup', 'Final', 'DNF']);
    expect(result).toMatchObject({
      sessionType: 'competition',
      disciplineId: 'spsf-precision',
      includesWarmup: true,
      hasFinal: true,
      dnf: true,
    });
    expect(result.passthroughTags).toEqual([]);
  });

  it('maps Milsnabb to its discipline', () => {
    expect(classifyTags(['Milsnabb']).disciplineId).toBe('spsf-milsnabb');
  });

  it('is case- and whitespace-insensitive on vocabulary tags', () => {
    expect(classifyTags([' tÄvling ', 'PRECISION']).sessionType).toBe('competition');
    expect(classifyTags([' tÄvling ', 'PRECISION']).disciplineId).toBe('spsf-precision');
  });

  it('suggests the optics weapon group from the A Opt tag', () => {
    expect(classifyTags(['A Opt']).weaponGroupHint).toBe('spsf:A-opt');
  });

  it('refuses a discipline when both discipline tags are present', () => {
    const result = classifyTags(['Precision', 'Milsnabb']);
    expect(result.disciplineId).toBeNull();
    expect(result.warnings).toEqual(['conflicting-discipline-tags']);
  });

  it('tolerates the same discipline tag twice', () => {
    const result = classifyTags(['Precision', 'precision']);
    expect(result.disciplineId).toBe('spsf-precision');
    expect(result.warnings).toEqual([]);
  });

  it('matches a firearm tag by name, case-insensitively', () => {
    expect(classifyTags(['pistol  one'], FIREARMS).firearmMatch).toEqual(FIREARMS[0]);
  });

  it('consumes a matched firearm tag rather than passing it through', () => {
    expect(classifyTags(['Pistol One', 'Club night'], FIREARMS).passthroughTags).toEqual([
      'Club night',
    ]);
  });

  it('tolerates the same firearm tag twice', () => {
    const result = classifyTags(['Pistol One', 'pistol one'], FIREARMS);
    expect(result.firearmMatch).toEqual(FIREARMS[0]);
    expect(result.warnings).toEqual([]);
  });

  it('refuses a firearm when two different firearms match', () => {
    const ambiguous = [
      { id: 'f1', label: 'Pistol One' },
      { id: 'f2', label: 'pistol one' },
    ];
    const result = classifyTags(['Pistol One'], ambiguous);
    expect(result.firearmMatch).toBeNull();
    expect(result.warnings).toEqual(['ambiguous-firearm-tag']);
  });

  it('keeps unknown tags verbatim, trimmed', () => {
    expect(classifyTags([' Club night ']).passthroughTags).toEqual(['Club night']);
  });
});

describe('suggestDisciplineFromName', () => {
  it.each([
    ['MS2 A', 'spsf-milsnabb'],
    ['MS A', 'spsf-milsnabb'],
    ['Milsnabb Riverside C1', 'spsf-milsnabb'],
    ['P4 B', 'spsf-precision'],
    ['KP1 Riverside', 'spsf-precision'],
    ['KP Riverside', 'spsf-precision'],
    ['Club Cup Precision C', 'spsf-precision'],
    ['Prec evening', 'spsf-precision'],
  ])('reads %s as %s', (name, expected) => {
    expect(suggestDisciplineFromName(name)).toBe(expected);
  });

  it('prefers milsnabb when a name carries both families’ keywords', () => {
    expect(suggestDisciplineFromName('MS2 precision warmup')).toBe('spsf-milsnabb');
  });

  it('returns null for a name with no discipline keyword', () => {
    expect(suggestDisciplineFromName('Club night A')).toBeNull();
  });

  it('does not read a keyword out of the middle of a word', () => {
    expect(suggestDisciplineFromName('Kpx3 Riverside')).toBeNull();
  });
});

describe('suggestWeaponGroupFromName', () => {
  it.each([
    ['Club Cup A', 'spsf:A', null],
    ['Club Cup B', 'spsf:B', null],
    ['Club Cup c', 'spsf:C', null],
    ['Club Cup R', 'spsf:R', null],
    ['Milsnabb Riverside C1', 'spsf:C', '1'],
  ])('reads the trailing token of %s', (name, weaponGroup, shooterClass) => {
    expect(suggestWeaponGroupFromName(name)).toEqual({ weaponGroup, shooterClass });
  });

  it('tolerates padding and repeated spaces around the trailing token', () => {
    expect(suggestWeaponGroupFromName('  Club  Cup   A  ')).toEqual({
      weaponGroup: 'spsf:A',
      shooterClass: null,
    });
  });

  it.each([['P4 B/R'], ['Club Cup'], ['Club Cup C4'], ['Club Cup AA'], ['']])(
    'refuses to guess from %s',
    (name) => {
      expect(suggestWeaponGroupFromName(name)).toBeNull();
    },
  );
});
