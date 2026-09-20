// Executable spec for docs/specs/m3-scoring-spec.md §4 (pistolskyttemärke
// per-series thresholds). Values are SHB Bilaga 1 mom 5.1.1.1 p. 452, as
// transcribed in docs/reference/spsf-shb-2026.md.
import { describe, expect, it } from 'vitest';

import {
  ageReduction,
  allMarkeThresholds,
  guldserieThreshold,
  isGuldserie,
  markeGroupForWeaponGroup,
  markeThreshold,
  type MarkeGroup,
  type MarkeValor,
} from './marke';

const precision = (over: Partial<Parameters<typeof guldserieThreshold>[0]> = {}) => ({
  weaponGroup: 'spsf:C',
  disciplineId: 'spsf-precision',
  seriesLength: 5,
  year: 2026,
  ...over,
});

describe('markeThreshold (spec M1-M3)', () => {
  const table: [MarkeValor, MarkeGroup, number][] = [
    ['brons', 'A', 32],
    ['brons', 'B', 33],
    ['brons', 'C', 34],
    ['silver', 'A', 38],
    ['silver', 'B', 39],
    ['silver', 'C', 40],
    ['guld', 'A', 43],
    ['guld', 'B', 45],
    ['guld', 'C', 46],
  ];

  it.each(table)('%s / group %s is %i points', (valor, markeGroup, expected) => {
    expect(markeThreshold({ valor, markeGroup, year: 2026 })).toBe(expected);
  });

  it('M1: an unknown birth year applies no reduction', () => {
    expect(markeThreshold({ valor: 'guld', markeGroup: 'C', year: 2026 })).toBe(46);
    expect(markeThreshold({ valor: 'guld', markeGroup: 'C', birthYear: null, year: 2026 })).toBe(
      46,
    );
  });
});

describe('ageReduction (spec M4-M7)', () => {
  it('M4: the year the shooter turns 55 still has no reduction', () => {
    expect(ageReduction(1970, 2025)).toBe(0);
  });

  it('M5: the year after turning 55 reduces by 1', () => {
    expect(ageReduction(1970, 2026)).toBe(1);
  });

  it('M6: the year the shooter turns 65 is still only the 55 reduction', () => {
    expect(ageReduction(1960, 2025)).toBe(1);
  });

  it('M7: the year after turning 65 reduces by 2', () => {
    expect(ageReduction(1960, 2026)).toBe(2);
  });

  it('young shooters get no reduction', () => {
    expect(ageReduction(2000, 2026)).toBe(0);
  });

  it('M5/M7 flow through to the threshold', () => {
    expect(markeThreshold({ valor: 'guld', markeGroup: 'C', birthYear: 1970, year: 2026 })).toBe(
      45,
    );
    expect(markeThreshold({ valor: 'guld', markeGroup: 'C', birthYear: 1960, year: 2026 })).toBe(
      44,
    );
    expect(markeThreshold({ valor: 'guld', markeGroup: 'A', birthYear: 1960, year: 2026 })).toBe(
      41,
    );
  });

  it('M13: an impossible birth year is rejected rather than mis-scored', () => {
    expect(() => ageReduction(1899, 2026)).toThrow(RangeError);
    expect(() => ageReduction(2027, 2026)).toThrow(RangeError);
    expect(() => ageReduction(1970.5, 2026)).toThrow(RangeError);
    expect(() =>
      markeThreshold({ valor: 'guld', markeGroup: 'C', birthYear: 3000, year: 2026 }),
    ).toThrow(RangeError);
  });
});

describe('markeGroupForWeaponGroup (spec M9, M10, M12)', () => {
  it('M10: every A sub-group maps to the A row', () => {
    for (const id of ['spsf:A', 'spsf:AM', 'spsf:AP', 'spsf:AG', 'spsf:A-opt']) {
      expect(markeGroupForWeaponGroup(id)).toBe('A');
    }
  });

  it('maps B and C directly', () => {
    expect(markeGroupForWeaponGroup('spsf:B')).toBe('B');
    expect(markeGroupForWeaponGroup('spsf:C')).toBe('C');
  });

  it('M9: groups with no märke row return null', () => {
    for (const id of ['spsf:R', 'spsf:M1', 'spsf:M9', 'generic:airgun']) {
      expect(markeGroupForWeaponGroup(id)).toBeNull();
    }
  });

  it('M12: a missing or unknown group returns null', () => {
    expect(markeGroupForWeaponGroup(null)).toBeNull();
    expect(markeGroupForWeaponGroup(undefined)).toBeNull();
    expect(markeGroupForWeaponGroup('')).toBeNull();
    expect(markeGroupForWeaponGroup('issf:whatever')).toBeNull();
    expect(markeGroupForWeaponGroup('C')).toBeNull();
  });
});

describe('guldserieThreshold (spec M8-M12)', () => {
  it('returns the guld threshold for a 5-shot precision series', () => {
    expect(guldserieThreshold(precision())).toBe(46);
    expect(guldserieThreshold(precision({ weaponGroup: 'spsf:A' }))).toBe(43);
    expect(guldserieThreshold(precision({ weaponGroup: 'spsf:B' }))).toBe(45);
  });

  it('applies the age reduction', () => {
    expect(guldserieThreshold(precision({ birthYear: 1960 }))).toBe(44);
  });

  it('M11: only 5-shot series have a per-series märke requirement', () => {
    expect(guldserieThreshold(precision({ seriesLength: 6 }))).toBeNull();
    expect(guldserieThreshold(precision({ seriesLength: 10 }))).toBeNull();
  });

  it('M11: only precision has one', () => {
    expect(guldserieThreshold(precision({ disciplineId: 'spsf-milsnabb' }))).toBeNull();
    expect(guldserieThreshold(precision({ disciplineId: 'generic-rings' }))).toBeNull();
  });

  it('M9/M12: no threshold without a mappable weapon group', () => {
    expect(guldserieThreshold(precision({ weaponGroup: 'spsf:R' }))).toBeNull();
    expect(guldserieThreshold(precision({ weaponGroup: null }))).toBeNull();
  });
});

describe('isGuldserie (spec M8)', () => {
  it('M8: the threshold is inclusive', () => {
    expect(isGuldserie(46, precision())).toBe(true);
    expect(isGuldserie(47, precision())).toBe(true);
    expect(isGuldserie(45, precision())).toBe(false);
  });

  it('is false whenever no threshold applies', () => {
    expect(isGuldserie(50, precision({ weaponGroup: 'spsf:R' }))).toBe(false);
    expect(isGuldserie(50, precision({ seriesLength: 10 }))).toBe(false);
  });

  it('honors the age reduction', () => {
    expect(isGuldserie(44, precision({ birthYear: 1960 }))).toBe(true);
    expect(isGuldserie(44, precision())).toBe(false);
  });
});

// Gaps found by mutation testing (Stryker survivors).
describe('mutation-hardening', () => {
  it('accepts the boundary birth years', () => {
    expect(ageReduction(1900, 2026)).toBe(2);
    expect(ageReduction(2026, 2026)).toBe(0);
  });

  it('names the accepted range in the rejection message', () => {
    expect(() => ageReduction(1899, 2026)).toThrow(
      /birthYear must be an integer between 1900 and 2026/,
    );
  });

  it('an undefined birth year is treated as unknown, not as an error', () => {
    expect(ageReduction(undefined, 2026)).toBe(0);
  });
});

describe('allMarkeThresholds', () => {
  it('matches markeThreshold for every valor/group cell, no reduction', () => {
    const table = allMarkeThresholds({ year: 2026 });
    for (const markeGroup of ['A', 'B', 'C'] as MarkeGroup[]) {
      for (const valor of ['brons', 'silver', 'guld'] as MarkeValor[]) {
        expect(table[markeGroup][valor]).toBe(markeThreshold({ valor, markeGroup, year: 2026 }));
      }
    }
  });

  it('has the documented base values', () => {
    expect(allMarkeThresholds({ year: 2026 })).toEqual({
      A: { brons: 32, silver: 38, guld: 43 },
      B: { brons: 33, silver: 39, guld: 45 },
      C: { brons: 34, silver: 40, guld: 46 },
    });
  });

  it('applies the age reduction to every cell', () => {
    const table = allMarkeThresholds({ birthYear: 1960, year: 2026 });
    expect(table).toEqual({
      A: { brons: 30, silver: 36, guld: 41 },
      B: { brons: 31, silver: 37, guld: 43 },
      C: { brons: 32, silver: 38, guld: 44 },
    });
  });

  it('rejects an impossible birth year, same as markeThreshold', () => {
    expect(() => allMarkeThresholds({ birthYear: 3000, year: 2026 })).toThrow(RangeError);
  });
});
