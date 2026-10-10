import { describe, expect, it } from 'vitest';

import { ISSF_JUNIOR_MAX_AGE } from './entries';
import {
  birthYearOptions,
  defaultShooterClass,
  isJunior,
  SKILL_CLASSES,
  spsfEligibleClasses,
  type ShooterProfile,
} from './eligibility';

function profile(overrides: Partial<ShooterProfile> = {}): ShooterProfile {
  return {
    birthYear: 1980,
    skillClass: '2',
    competesInWomensClasses: false,
    ...overrides,
  };
}

describe('spsfEligibleClasses', () => {
  it('holds several classes at once, which is the whole point', () => {
    // A woman of 62 in skill class 2: open 2, Dam 2 and Vet Y are all hers,
    // and she picks one per competition (maintainer, 2026-09-12).
    const classes = spsfEligibleClasses(
      profile({ birthYear: 1964, skillClass: '2', competesInWomensClasses: true }),
      2026,
    );

    expect(classes).toEqual(['2', 'Dam2', 'VetY']);
  });

  it('offers only the skill class to a shooter with nothing else', () => {
    expect(spsfEligibleClasses(profile({ birthYear: 1980 }), 2026)).toEqual(['2']);
  });

  it('adds the matching Dam class, never a different number', () => {
    // Dam 1/2/3 parallel the skill classes; a klass 3 shooter is Dam 3.
    const classes = spsfEligibleClasses(
      profile({ skillClass: '3', competesInWomensClasses: true }),
      2026,
    );

    expect(classes).toContain('Dam3');
    expect(classes).not.toContain('Dam2');
  });

  it('counts junior by the year, not the birthday', () => {
    // SHB F.2.1: the year turning 20. Someone born in 2006 is junior through
    // all of 2026 whatever month it is.
    expect(spsfEligibleClasses(profile({ birthYear: 2006 }), 2026)).toContain('Jun');
    expect(spsfEligibleClasses(profile({ birthYear: 2005 }), 2026)).not.toContain('Jun');
  });

  it('opens Vet Y in the year the shooter turns 60', () => {
    expect(spsfEligibleClasses(profile({ birthYear: 1966 }), 2026)).toContain('VetY');
    expect(spsfEligibleClasses(profile({ birthYear: 1967 }), 2026)).not.toContain('VetY');
  });

  it('offers both veteran classes from 70, deliberately', () => {
    // VERIFY in eligibility.ts: SHB does not say the bands are exclusive.
    // This list only prefills an overridable picker, so one class too many
    // costs a tap and one too few costs the entry.
    const classes = spsfEligibleClasses(profile({ birthYear: 1956 }), 2026);

    expect(classes).toContain('VetY');
    expect(classes).toContain('VetÄ');
  });

  it('offers nothing when neither the class nor the birth year is known', () => {
    expect(spsfEligibleClasses(profile({ birthYear: null, skillClass: null }), 2026)).toEqual([]);
  });

  it('still offers age categories to a shooter with no skill class yet', () => {
    // A new shooter may know their age but not yet hold a klass.
    expect(spsfEligibleClasses(profile({ birthYear: 1950, skillClass: null }), 2026)).toEqual([
      'VetY',
      'VetÄ',
    ]);
  });
});

describe('defaultShooterClass', () => {
  it('preselects the skill class, not the veteran one', () => {
    // Eligible for three; the one held by default is the skill class.
    expect(
      defaultShooterClass(
        profile({ birthYear: 1964, skillClass: '2', competesInWomensClasses: true }),
        2026,
      ),
    ).toBe('2');
  });

  it('is null when nothing is known, rather than guessing', () => {
    expect(defaultShooterClass(profile({ birthYear: null, skillClass: null }), 2026)).toBeNull();
  });
});

describe('isJunior', () => {
  it('uses the federation threshold it is given', () => {
    // ISSF runs a year longer than SPSF: junior until 31 December of the year
    // the athlete turns 21 (ISSF clarification, 2023-04-13).
    const born2005 = profile({ birthYear: 2005 });

    expect(isJunior(born2005, 2026)).toBe(false);
    expect(isJunior(born2005, 2026, ISSF_JUNIOR_MAX_AGE)).toBe(true);
  });

  it('is false when the birth year is unknown', () => {
    expect(isJunior(profile({ birthYear: null }), 2026)).toBe(false);
  });
});

describe('spsfEligibleClasses with a vapengrupp', () => {
  it('drops Dam and Vet outside vapengrupp C', () => {
    // SHB F.2.1: those classes exist only in C, so an A-gun session offers
    // the open classes and nothing else.
    const woman = profile({ birthYear: 1964, skillClass: '2', competesInWomensClasses: true });

    expect(spsfEligibleClasses(woman, 2026, 'spsf:A')).toEqual(['2']);
  });

  it('keeps them in vapengrupp C', () => {
    const woman = profile({ birthYear: 1964, skillClass: '2', competesInWomensClasses: true });

    expect(spsfEligibleClasses(woman, 2026, 'spsf:C')).toEqual(['2', 'Dam2', 'VetY']);
  });

  it('offers everything when no gun has been chosen yet', () => {
    // The session screen starts with no weapon group selected.
    const woman = profile({ birthYear: 1964, skillClass: '2', competesInWomensClasses: true });

    expect(spsfEligibleClasses(woman, 2026, null)).toEqual(['2', 'Dam2', 'VetY']);
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_DISC_001
 */
it('offers the klasser the shooter holds, and none that vapengrupp C does not allow', () => {
  const her = profile({ birthYear: 1964, skillClass: '2', competesInWomensClasses: true });
  // Vapengrupp C: her own klass, plus the dam and veteran ones she may enter.
  expect(spsfEligibleClasses(her, 2026, 'spsf:C')).toEqual(['2', 'Dam2', 'VetY']);
  // Dam/Jun/Vet exist in C only (SHB F.2.1 p. 163), so "A Dam 2" is not offered.
  expect(spsfEligibleClasses(her, 2026, 'spsf:A')).toEqual(['2']);
  // A klass carrying a skill level is only hers at HER level — never Dam 3.
  expect(spsfEligibleClasses(her, 2026, 'spsf:C')).not.toContain('Dam3');
});

describe('option lists the phone and the web share', () => {
  it('O1 SKILL_CLASSES is 1, 2, 3', () => {
    expect(SKILL_CLASSES).toEqual(['1', '2', '3']);
  });

  it('O2 birthYearOptions(2026) runs 2016 down to 1926, 91 years', () => {
    const years = birthYearOptions(2026);
    expect(years).toHaveLength(91);
    expect(years[0]).toBe(2016);
    expect(years[90]).toBe(1926);
    expect(years.every((year, i) => i === 0 || year === years[i - 1]! - 1)).toBe(true);
  });
});
