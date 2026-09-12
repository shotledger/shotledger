import { describe, expect, it } from 'vitest';

import { SPSF_SHOOTER_CLASSES } from './classes';
import {
  ISSF_EVENTS,
  OPEN_CATEGORY,
  SPSF_CLASS_DEFINITIONS,
  eventId,
  eventsForDiscipline,
  findEvent,
} from './entries';
import {
  isEligibleForCategory,
  isEligibleForEvent,
  rankEventsForShooter,
  type ShooterProfile,
} from './eligibility';

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
  /** `<gender>:<age>` for each event, in definition order. */
  function categories(disciplineId: string): string[] {
    return eventsForDiscipline(disciplineId).map((e) => `${e.category.gender}:${e.category.age}`);
  }

  it('gives 10 m air pistol all four Rule 3.3 events', () => {
    // Table p. 182 APM "M, MJ"; table p. 183 APW "W, WJ".
    expect(categories('issf-air-pistol')).toEqual([
      'men:open',
      'men:junior',
      'women:open',
      'women:junior',
    ]);
  });

  it("has no women's rapid fire event, because none is recognized", () => {
    // RFPM "M, MJ" on p. 182; the event does not appear in the women's table.
    expect(categories('issf-rapid-fire-pistol')).toEqual(['men:open', 'men:junior']);
  });

  it('recognizes 25 m pistol for men ONLY as a junior event', () => {
    // SPM on p. 182 reads "MJ only" — the one row where the men's and women's
    // tables disagree about the senior event, and the reason the age axis
    // cannot be folded into the gender one.
    expect(categories('issf-sport-pistol')).toEqual(['men:junior', 'women:open', 'women:junior']);
  });

  it('still recognizes 25 m standard pistol and 50 m pistol', () => {
    // Both are absent from the Olympic programme, which is not the same as
    // being dropped: STPM/STPW and FPM/FPW are WCH events in the 2026 book.
    // So SvSF needs no definition of its own for either (ADR 0011).
    for (const disciplineId of ['issf-standard-pistol', 'issf-free-pistol']) {
      expect(categories(disciplineId)).toEqual([
        'men:open',
        'men:junior',
        'women:open',
        'women:junior',
      ]);
    }
  });

  it('yields no events for a discipline that has no event dimension', () => {
    // An SPSF discipline carries klasser instead. Empty is not "one open
    // event" — a synthetic id would dangle on a stored session.
    expect(eventsForDiscipline('spsf-precision')).toEqual([]);
  });

  it('gives every event a unique id, and attributes each to its regelverk', () => {
    const ids = ISSF_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ISSF_EVENTS.every((e) => e.regulationId === 'ISSF')).toBe(true);
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

  it('looks an event up by id, and says so when there is none', () => {
    // A session stores the id; a later edition may stop recognizing it.
    expect(findEvent('issf-sport-pistol:women:junior')?.disciplineId).toBe('issf-sport-pistol');
    expect(findEvent('issf-sport-pistol:men:open')).toBeUndefined();
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
  it("puts a woman's air pistol events first without hiding the men's", () => {
    const events = rankEventsForShooter(
      profile({ competesInWomensClasses: true }),
      'issf-air-pistol',
      2026,
    );

    expect(events.map((e) => `${e.category.gender}:${e.category.age}`)).toEqual([
      'women:open',
      'men:open',
      'men:junior',
      'women:junior',
    ]);
  });

  it('ranks a junior woman into the junior event', () => {
    const events = rankEventsForShooter(
      profile({ birthYear: 2008, competesInWomensClasses: true }),
      'issf-air-pistol',
      2026,
    );

    // Eligible for both her senior and her junior event, in definition order.
    expect(events.slice(0, 2).map((e) => e.id)).toEqual([
      'issf-air-pistol:women:open',
      'issf-air-pistol:women:junior',
    ]);
  });

  it("still offers the rapid fire events to a shooter in the women's classes", () => {
    // ISSF has never recognized a women's rapid fire event, but a club evening
    // is not ISSF. Ranking, not gating — otherwise there is nothing to log.
    const events = rankEventsForShooter(
      profile({ competesInWomensClasses: true }),
      'issf-rapid-fire-pistol',
      2026,
    );

    expect(events.map((e) => e.id)).toEqual([
      'issf-rapid-fire-pistol:men:open',
      'issf-rapid-fire-pistol:men:junior',
    ]);
  });

  it('uses the ISSF junior age, not the SPSF one', () => {
    // Born 2005 is 21 in 2026: a junior to ISSF, not to SPSF.
    const events = rankEventsForShooter(profile({ birthYear: 2005 }), 'issf-air-pistol', 2026);

    expect(events[0]!.id).toBe('issf-air-pistol:men:open');
    expect(events[1]!.id).toBe('issf-air-pistol:men:junior');
  });

  it('returns nothing for a discipline with no event dimension', () => {
    expect(rankEventsForShooter(profile(), 'spsf-precision', 2026)).toEqual([]);
  });
});

describe('isEligibleForEvent', () => {
  it('asks the event its own category, at the ISSF junior age', () => {
    // The picker uses this to mark one event rather than to hide the others.
    const juniorWoman = profile({ birthYear: 2005, competesInWomensClasses: true });
    const womenJunior = findEvent('issf-air-pistol:women:junior')!;
    const menOpen = findEvent('issf-air-pistol:men:open')!;

    // 21 in 2026: a junior to ISSF, and she would not be one to SPSF.
    expect(isEligibleForEvent(juniorWoman, womenJunior, 2026)).toBe(true);
    expect(isEligibleForEvent(juniorWoman, menOpen, 2026)).toBe(false);
    expect(isEligibleForEvent(juniorWoman, womenJunior, 2027)).toBe(false);
  });
});
