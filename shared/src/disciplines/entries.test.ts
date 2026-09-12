import { describe, expect, it } from 'vitest';

import { SPSF_SHOOTER_CLASSES } from './classes';
import {
  ISSF_EVENTS,
  OPEN_CATEGORY,
  SPSF_CLASS_DEFINITIONS,
  eventId,
  eventsForDiscipline,
} from './entries';
import { isEligibleForCategory, rankEventsForShooter, type ShooterProfile } from './eligibility';

function profile(overrides: Partial<ShooterProfile> = {}): ShooterProfile {
  return { birthYear: 1980, skillClass: '2', competesInWomensClasses: false, ...overrides };
}

describe('SPSF class definitions', () => {
  it('decomposes every klass into category and skill level', () => {
    // The list is nine codes; the model underneath is two dimensions.
    expect(SPSF_CLASS_DEFINITIONS.find((d) => d.code === 'Dam2')).toMatchObject({
      code: 'Dam2',
      category: { gender: 'women', age: 'open' },
      skillClass: '2',
    });
    expect(SPSF_CLASS_DEFINITIONS.find((d) => d.code === 'VetY')).toMatchObject({
      code: 'VetY',
      category: { gender: 'open', age: 'veteranYounger' },
      skillClass: null,
    });
  });

  it('never marks an SPSF klass as men-only', () => {
    // SHB F.2.2 p. 163: a shooter in junior-, dam- or veteranklass may also
    // "tävla i (öppen) klass 1, 2 eller 3". The open classes are open, and
    // calling them men's would exclude a woman from her own klass 2.
    expect(SPSF_CLASS_DEFINITIONS.some((d) => d.category.gender === 'men')).toBe(false);
  });

  it('confines Jun, Dam and Vet to vapengrupp C', () => {
    // SHB F.2.1 table p. 163, and F.2.8/F.2.9/F.2.10 each say "vapengrupp C".
    // "A Dam 2" is not a class anyone can enter.
    for (const code of ['Jun', 'Dam1', 'Dam2', 'Dam3', 'VetY', 'VetÄ']) {
      const definition = SPSF_CLASS_DEFINITIONS.find((d) => d.code === code)!;
      expect(definition.weaponGroupIds).toEqual(['spsf:C']);
    }
  });

  it('lets the open classes run in A, B and C', () => {
    for (const code of ['1', '2', '3']) {
      const definition = SPSF_CLASS_DEFINITIONS.find((d) => d.code === code)!;
      expect(definition.weaponGroupIds).toEqual(['spsf:A', 'spsf:B', 'spsf:C']);
    }
  });

  it('covers exactly the klasser the federation defines, with no drift', () => {
    // Two parallel lists of the same nine codes would rot apart silently,
    // and a code in one but not the other vanishes from the offered list.
    expect(SPSF_CLASS_DEFINITIONS.map((d) => d.code).sort()).toEqual(
      [...SPSF_SHOOTER_CLASSES].sort(),
    );
  });
});

describe('ISSF events', () => {
  it("splits 10 m air pistol into a men's and a women's event", () => {
    const genders = eventsForDiscipline('issf-air-pistol').map((e) => e.category.gender);

    expect(genders).toEqual(['men', 'women']);
  });

  it("has no women's rapid fire event, because none exists", () => {
    const genders = eventsForDiscipline('issf-rapid-fire-pistol').map((e) => e.category.gender);

    expect(genders).toEqual(['men']);
  });

  it('yields no events for a discipline whose categories are unread', () => {
    // Unknown is not the same as open. A synthetic open event would mint an
    // id that dangles on a stored session once the real ones are read in.
    expect(eventsForDiscipline('issf-free-pistol')).toEqual([]);
  });

  it('gives every event a unique id', () => {
    const ids = ISSF_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds ids from the discipline and BOTH axes', () => {
    // The whole reason for the split: a junior women's event has to be
    // nameable, and one enum could not distinguish it from either parent.
    expect(eventId('issf-air-pistol', { gender: 'women', age: 'open' })).toBe(
      'issf-air-pistol:women:open',
    );
    expect(eventId('issf-air-pistol', { gender: 'women', age: 'junior' })).toBe(
      'issf-air-pistol:women:junior',
    );
  });
});

describe('isEligibleForCategory', () => {
  it('lets anyone into an open entry', () => {
    expect(isEligibleForCategory(profile({ birthYear: null }), OPEN_CATEGORY, 2026)).toBe(true);
  });

  it('requires BOTH axes, which is the point of the split', () => {
    // A junior women's event needs a shooter who is both.
    const juniorWomen = { gender: 'women', age: 'junior' } as const;
    const juniorWoman = profile({ birthYear: 2010, competesInWomensClasses: true });
    const olderWoman = profile({ birthYear: 1980, competesInWomensClasses: true });
    const juniorOther = profile({ birthYear: 2010, competesInWomensClasses: false });

    expect(isEligibleForCategory(juniorWoman, juniorWomen, 2026)).toBe(true);
    expect(isEligibleForCategory(olderWoman, juniorWomen, 2026)).toBe(false);
    expect(isEligibleForCategory(juniorOther, juniorWomen, 2026)).toBe(false);
  });

  it('treats men and women as complementary, not as a second stored fact', () => {
    const woman = profile({ competesInWomensClasses: true });
    const other = profile({ competesInWomensClasses: false });

    const women = { gender: 'women', age: 'open' } as const;
    const men = { gender: 'men', age: 'open' } as const;

    expect(isEligibleForCategory(woman, women, 2026)).toBe(true);
    expect(isEligibleForCategory(woman, men, 2026)).toBe(false);
    expect(isEligibleForCategory(other, men, 2026)).toBe(true);
    expect(isEligibleForCategory(other, women, 2026)).toBe(false);
  });

  it('uses the junior threshold it is handed', () => {
    // Same shooter, two federations: SPSF stops at the year turning 20, ISSF
    // at the year turning 21.
    const born2005 = profile({ birthYear: 2005 });

    const junior = { gender: 'open', age: 'junior' } as const;

    expect(isEligibleForCategory(born2005, junior, 2026)).toBe(false);
    expect(isEligibleForCategory(born2005, junior, 2026, 21)).toBe(true);
  });
});

describe('rankEventsForShooter', () => {
  it("puts a woman's air pistol event first without hiding the other", () => {
    const events = rankEventsForShooter(
      profile({ competesInWomensClasses: true }),
      'issf-air-pistol',
      2026,
    );

    expect(events.map((e) => e.category.gender)).toEqual(['women', 'men']);
  });

  it("still offers the rapid fire event to a shooter in the women's classes", () => {
    // ISSF has never run a women's rapid fire event, but a club evening is
    // not ISSF. Ranking, not gating — otherwise there is nothing to log.
    const events = rankEventsForShooter(
      profile({ competesInWomensClasses: true }),
      'issf-rapid-fire-pistol',
      2026,
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.category.gender).toBe('men');
  });

  it('returns nothing for a discipline with no events read in', () => {
    expect(rankEventsForShooter(profile(), 'issf-free-pistol', 2026)).toEqual([]);
  });
});
