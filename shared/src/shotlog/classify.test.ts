import { describe, expect, it } from 'vitest';

import { classifyTags, suggestDisciplineFromName, suggestWeaponGroupFromName } from './classify';
import { buildDefaultTagMapping, defaultTagRole } from './tags';
import type { ShotlogTagMapping } from './types';

const FIREARMS = [
  { id: 'f1', label: 'Pistol One' },
  { id: 'f2', label: 'Revolver Two' },
];

/** The mapping the screen would start from, for the given tags. */
function mappingFor(...tags: string[]): ShotlogTagMapping {
  return buildDefaultTagMapping([{ tags }]);
}

describe('classifyTags', () => {
  it('defaults to a training session with nothing resolved', () => {
    expect(classifyTags([])).toEqual({
      sessionType: 'training',
      disciplineId: null,
      includesSighter: false,
      hasFinal: false,
      dnf: false,
      weaponGroup: null,
      shooterClass: null,
      firearmMatch: null,
      firearmLabel: null,
      passthroughTags: [],
      warnings: [],
    });
  });

  it('applies the whole role vocabulary from a mapping', () => {
    const tags = ['Tävling', 'Precision', 'Warmup', 'Final', 'DNF'];
    const result = classifyTags(tags, mappingFor(...tags));
    expect(result).toMatchObject({
      sessionType: 'competition',
      disciplineId: 'spsf-precision',
      includesSighter: true,
      hasFinal: true,
      dnf: true,
    });
    expect(result.passthroughTags).toEqual([]);
  });

  it('passes a tag with no mapping entry through untouched', () => {
    expect(classifyTags(['Precision']).passthroughTags).toEqual(['Precision']);
  });

  it('passes a tag mapped to ignore through untouched', () => {
    expect(classifyTags(['Precision'], { precision: { kind: 'ignore' } }).passthroughTags).toEqual([
      'Precision',
    ]);
  });

  it('honors a mapping the user changed away from the default', () => {
    const result = classifyTags(['Precision'], { precision: { kind: 'competition' } });
    expect(result.sessionType).toBe('competition');
    expect(result.disciplineId).toBeNull();
  });

  it('is case- and whitespace-insensitive when looking a tag up', () => {
    const result = classifyTags([' tÄvling ', 'PRECISION'], mappingFor('Tävling', 'Precision'));
    expect(result.sessionType).toBe('competition');
    expect(result.disciplineId).toBe('spsf-precision');
  });

  it('takes a weapon group and its class from one tag', () => {
    const result = classifyTags(['C1'], mappingFor('C1'));
    expect(result.weaponGroup).toBe('spsf:C');
    expect(result.shooterClass).toBe('1');
  });

  it('reads A Opt as the optics weapon group, not a firearm', () => {
    expect(classifyTags(['A Opt'], mappingFor('A Opt')).weaponGroup).toBe('spsf:A-opt');
  });

  it('refuses a discipline when two different discipline tags are mapped', () => {
    const tags = ['Precision', 'Milsnabb'];
    const result = classifyTags(tags, mappingFor(...tags));
    expect(result.disciplineId).toBeNull();
    expect(result.warnings).toEqual(['conflicting-discipline-tags']);
  });

  it('tolerates the same discipline resolved twice', () => {
    const result = classifyTags(['Precision', 'precision'], mappingFor('Precision'));
    expect(result.disciplineId).toBe('spsf-precision');
    expect(result.warnings).toEqual([]);
  });

  it('refuses a weapon group when two different group tags are mapped', () => {
    const tags = ['C', 'B'];
    const result = classifyTags(tags, mappingFor(...tags));
    expect(result.weaponGroup).toBeNull();
    expect(result.shooterClass).toBeNull();
    expect(result.warnings).toEqual(['conflicting-weapon-group-tags']);
  });

  it('tolerates the same weapon group twice', () => {
    const result = classifyTags(['C', 'c'], mappingFor('C'));
    expect(result.weaponGroup).toBe('spsf:C');
    expect(result.warnings).toEqual([]);
  });

  it('matches a firearm-role tag to an existing firearm, case-insensitively', () => {
    const result = classifyTags(['pistol  one'], mappingFor('pistol  one'), FIREARMS);
    expect(result.firearmMatch).toEqual(FIREARMS[0]);
    expect(result.firearmLabel).toBe('pistol  one');
  });

  it('reports the label when no existing firearm matches', () => {
    const result = classifyTags(['Pistol Three'], mappingFor('Pistol Three'), FIREARMS);
    expect(result.firearmMatch).toBeNull();
    expect(result.firearmLabel).toBe('Pistol Three');
  });

  it('consumes a firearm-role tag rather than passing it through', () => {
    const tags = ['Pistol One', 'Club night'];
    const result = classifyTags(tags, { 'pistol one': { kind: 'firearm', label: 'Pistol One' } });
    expect(result.passthroughTags).toEqual(['Club night']);
  });

  it('tolerates the same firearm label twice', () => {
    const result = classifyTags(['Pistol One', 'pistol one'], mappingFor('Pistol One'), FIREARMS);
    expect(result.firearmMatch).toEqual(FIREARMS[0]);
    expect(result.warnings).toEqual([]);
  });

  it('refuses a firearm when two different firearm labels are mapped', () => {
    const tags = ['Pistol One', 'Revolver Two'];
    const result = classifyTags(tags, mappingFor(...tags), FIREARMS);
    expect(result.firearmMatch).toBeNull();
    expect(result.firearmLabel).toBeNull();
    expect(result.warnings).toEqual(['ambiguous-firearm-tag']);
  });

  it('refuses a firearm when one label matches two stored firearms', () => {
    const ambiguous = [
      { id: 'f1', label: 'Pistol One' },
      { id: 'f2', label: 'pistol one' },
    ];
    const result = classifyTags(['Pistol One'], mappingFor('Pistol One'), ambiguous);
    expect(result.firearmMatch).toBeNull();
    expect(result.firearmLabel).toBe('Pistol One');
  });

  it('keeps an unmapped tag verbatim, trimmed', () => {
    expect(classifyTags([' Club night ']).passthroughTags).toEqual(['Club night']);
  });

  it('gives an unrecognized tag the firearm role by default', () => {
    expect(defaultTagRole('Club night')).toEqual({ kind: 'firearm', label: 'Club night' });
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
