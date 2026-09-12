import { describe, expect, it } from 'vitest';

import { SPSF_SHOOTER_CLASSES } from './classes';
import { ISSF_EVENTS, SPSF_CLASS_DEFINITIONS, eventId, eventsForDiscipline } from './entries';
import { eligibleEvents, isEligibleForCategory, type ShooterProfile } from './eligibility';

function profile(overrides: Partial<ShooterProfile> = {}): ShooterProfile {
  return { birthYear: 1980, skillClass: '2', competesInWomensClasses: false, ...overrides };
}

describe('SPSF class definitions', () => {
  it('decomposes every klass into category and skill level', () => {
    // The list is nine codes; the model underneath is two dimensions.
    expect(SPSF_CLASS_DEFINITIONS.find((d) => d.code === 'Dam2')).toMatchObject({
      code: 'Dam2',
      category: 'women',
      skillClass: '2',
    });
    expect(SPSF_CLASS_DEFINITIONS.find((d) => d.code === 'VetY')).toMatchObject({
      code: 'VetY',
      category: 'veteranYounger',
      skillClass: null,
    });
  });

  it('never marks an SPSF klass as men-only', () => {
    // SHB F.2.2 p. 163: a shooter in junior-, dam- or veteranklass may also
    // "tävla i (öppen) klass 1, 2 eller 3". The open classes are open, and
    // calling them men's would exclude a woman from her own klass 2.
    expect(SPSF_CLASS_DEFINITIONS.some((d) => d.category === 'men')).toBe(false);
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
    const categories = eventsForDiscipline('issf-air-pistol').map((e) => e.category);

    expect(categories).toEqual(['men', 'women']);
  });

  it("has no women's rapid fire event, because none exists", () => {
    const categories = eventsForDiscipline('issf-rapid-fire-pistol').map((e) => e.category);

    expect(categories).toEqual(['men']);
  });

  it('treats an unconfirmed discipline as open rather than hiding it', () => {
    // 50 m pistol's current category could not be confirmed, so it is not in
    // ISSF_EVENTS. It must still be usable.
    const events = eventsForDiscipline('issf-free-pistol');

    expect(events).toHaveLength(1);
    expect(events[0]!.category).toBe('open');
  });

  it('gives every event a unique id', () => {
    const ids = ISSF_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds ids from the discipline and the category', () => {
    expect(eventId('issf-air-pistol', 'women')).toBe('issf-air-pistol:women');
  });
});

describe('isEligibleForCategory', () => {
  it('lets anyone into an open entry', () => {
    expect(isEligibleForCategory(profile({ birthYear: null }), 'open', 2026)).toBe(true);
  });

  it('treats men and women as complementary, not as a second stored fact', () => {
    const woman = profile({ competesInWomensClasses: true });
    const other = profile({ competesInWomensClasses: false });

    expect(isEligibleForCategory(woman, 'women', 2026)).toBe(true);
    expect(isEligibleForCategory(woman, 'men', 2026)).toBe(false);
    expect(isEligibleForCategory(other, 'men', 2026)).toBe(true);
    expect(isEligibleForCategory(other, 'women', 2026)).toBe(false);
  });

  it('uses the junior threshold it is handed', () => {
    // Same shooter, two federations: SPSF stops at the year turning 20, ISSF
    // at the year turning 21.
    const born2005 = profile({ birthYear: 2005 });

    expect(isEligibleForCategory(born2005, 'junior', 2026)).toBe(false);
    expect(isEligibleForCategory(born2005, 'junior', 2026, 21)).toBe(true);
  });
});

describe('eligibleEvents', () => {
  it("offers a woman the women's air pistol event and not the men's", () => {
    const events = eligibleEvents(
      profile({ competesInWomensClasses: true }),
      'issf-air-pistol',
      2026,
    );

    expect(events.map((e) => e.category)).toEqual(['women']);
  });

  it("offers no rapid fire event to a shooter in the women's classes", () => {
    // Structural, not a slight: ISSF has never run a women's rapid fire event,
    // so there is nothing to offer.
    expect(
      eligibleEvents(profile({ competesInWomensClasses: true }), 'issf-rapid-fire-pistol', 2026),
    ).toEqual([]);
  });

  it('offers the open event of an unconfirmed discipline to everyone', () => {
    expect(
      eligibleEvents(profile({ competesInWomensClasses: true }), 'issf-free-pistol', 2026),
    ).toHaveLength(1);
  });
});
