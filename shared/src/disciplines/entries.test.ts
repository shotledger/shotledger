import { describe, expect, it } from 'vitest';

import { ISSF_REGULATION_ID, SVSF_REGULATION_ID } from '../regulations/registry';
import { SPSF_SHOOTER_CLASSES } from './classes';
import {
  EVENTS,
  ISSF_EVENTS,
  ISSF_JUNIOR_MAX_AGE,
  OPEN_CATEGORY,
  SPSF_CLASS_DEFINITIONS,
  SVSF_EVENTS,
  SVSF_NATIONAL_JUNIOR_MAX_AGE,
  eventId,
  eventsForDiscipline,
  categoryKey,
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

/** `<gender>:<age>` for each event, in definition order. */
function categories(disciplineId: string, regulationIds?: readonly string[]): string[] {
  return eventsForDiscipline(disciplineId, regulationIds).map(
    (e) => `${e.category.gender}:${e.category.age}`,
  );
}

describe('ISSF events', () => {
  /** Rule 3.3's own list — what ISSF recognizes, before SvSF adds anything. */
  const ISSF = [ISSF_REGULATION_ID];

  it('gives 10 m air pistol all four Rule 3.3 events', () => {
    // Table p. 182 APM "M, MJ"; table p. 183 APW "W, WJ".
    expect(categories('issf-air-pistol', ISSF)).toEqual([
      'men:open',
      'men:junior',
      'women:open',
      'women:junior',
    ]);
  });

  it("has no women's rapid fire event, because none is recognized", () => {
    // RFPM "M, MJ" on p. 182; the event does not appear in the women's table.
    expect(categories('issf-rapid-fire-pistol', ISSF)).toEqual(['men:open', 'men:junior']);
  });

  it('recognizes 25 m pistol for men ONLY as a junior event', () => {
    // SPM on p. 182 reads "MJ only" — the one row where the men's and women's
    // tables disagree about the senior event, and the reason the age axis
    // cannot be folded into the gender one.
    expect(categories('issf-sport-pistol', ISSF)).toEqual([
      'men:junior',
      'women:open',
      'women:junior',
    ]);
  });

  it('recognizes 25 m center fire pistol for seniors only', () => {
    // CFPM "M only", CFPW "W" — no junior row in either table.
    expect(categories('issf-centre-fire-pistol', ISSF)).toEqual(['men:open', 'women:open']);
  });

  it('still recognizes 25 m standard pistol and 50 m pistol', () => {
    // Both are absent from the Olympic program, which is not the same as
    // being dropped: STPM/STPW and FPM/FPW are WCH events in the 2026 book.
    // So SvSF needs no definition of its own for either (ADR 0011).
    for (const disciplineId of ['issf-standard-pistol', 'issf-free-pistol']) {
      expect(categories(disciplineId, ISSF)).toEqual([
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
    expect(ISSF_EVENTS.every((e) => e.regulationId === ISSF_REGULATION_ID)).toBe(true);
  });

  it('runs juniors to the year they turn 21 on every event (Rule 3.7.4.12)', () => {
    expect(ISSF_EVENTS.every((e) => e.juniorMaxAge === ISSF_JUNIOR_MAX_AGE)).toBe(true);
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
    expect(findEvent('issf-rapid-fire-pistol:women:open')).toBeUndefined();
  });
});

describe('SvSF events', () => {
  const SVSF = [SVSF_REGULATION_ID];

  it('is exactly the Tävlings-PM 15.1 rows ISSF Rule 3.3 has no event for', () => {
    // Pinned so a row cannot slip in unnoticed; every one traces to a 15.1
    // line in docs/reference/svsf-rules.md.
    expect(SVSF_EVENTS.map((e) => e.id)).toEqual([
      'issf-sport-pistol:men:open',
      'issf-standard-pistol:open:junior',
      'issf-rapid-fire-pistol:open:open',
      'issf-rapid-fire-pistol:open:junior',
      'issf-free-pistol:open:open',
      'issf-free-pistol:open:junior',
      'issf-centre-fire-pistol:open:open',
      'svsf-snabbluftpistol:open:open',
      'svsf-snabbluftpistol:open:junior',
    ]);
    expect(SVSF_EVENTS.every((e) => e.regulationId === SVSF_REGULATION_ID)).toBe(true);
  });

  it('never duplicates an ISSF event — "ISSF has prio"', () => {
    // The do-not-duplicate rule (ADR 0011) as an executable check: an SvSF
    // row with an ISSF id would be the same event defined twice.
    const issfIds = new Set(ISSF_EVENTS.map((e) => e.id));
    for (const event of SVSF_EVENTS) expect(issfIds.has(event.id)).toBe(false);
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the ISSF junior age on ISSF grenar and the national one on its own', () => {
    // Allmänna bestämmelser 1.5.1 vs 1.5.2: 21 on ISSF grenar, 20 otherwise.
    for (const event of SVSF_EVENTS) {
      const expected =
        event.disciplineId === 'svsf-snabbluftpistol'
          ? SVSF_NATIONAL_JUNIOR_MAX_AGE
          : ISSF_JUNIOR_MAX_AGE;
      expect(event.juniorMaxAge).toBe(expected);
    }
    expect(SVSF_NATIONAL_JUNIOR_MAX_AGE).toBe(20);
    expect(ISSF_JUNIOR_MAX_AGE).toBe(21);
  });

  it("adds a men's sportpistol event that ISSF does not have", () => {
    // Rule 3.3 has 25 m Pistol as "MJ only" for men; SM list and 15.1 have
    // Sportpistol Herr. Offered only when SvSF is in play.
    expect(categories('issf-sport-pistol', [ISSF_REGULATION_ID])).not.toContain('men:open');
    expect(categories('issf-sport-pistol', [ISSF_REGULATION_ID, SVSF_REGULATION_ID])).toEqual([
      'men:junior',
      'women:open',
      'women:junior',
      'men:open',
    ]);
    expect(categories('issf-sport-pistol', SVSF)).toEqual(['men:open']);
  });

  it("returns every regelverk's events when no filter is given", () => {
    expect(categories('issf-rapid-fire-pistol')).toEqual([
      'men:open',
      'men:junior',
      'open:open',
      'open:junior',
    ]);
  });

  it('finds an SvSF event by id, and keeps it findable with SvSF switched off', () => {
    // findEvent searches everything: a stored session must still resolve.
    expect(findEvent('svsf-snabbluftpistol:open:junior')?.regulationId).toBe(SVSF_REGULATION_ID);
    expect(findEvent('issf-sport-pistol:men:open')?.regulationId).toBe(SVSF_REGULATION_ID);
  });

  it('has nothing to add to air pistol', () => {
    // Herr, dam, herrjunior and damjunior are all ISSF events already.
    expect(categories('issf-air-pistol', SVSF)).toEqual([]);
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
  const ISSF = [ISSF_REGULATION_ID];

  it("puts a woman's air pistol events first without hiding the men's", () => {
    const events = rankEventsForShooter(
      profile({ competesInWomensClasses: true }),
      'issf-air-pistol',
      2026,
      ISSF,
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
      ISSF,
    );

    expect(events.map((e) => e.id)).toEqual([
      'issf-rapid-fire-pistol:men:open',
      'issf-rapid-fire-pistol:men:junior',
    ]);
  });

  it("ranks SvSF's open snabbpistol class first for her once SvSF is in play", () => {
    // Under SvSF she has an event she is eligible for; the ISSF men's ones
    // follow rather than vanish.
    const events = rankEventsForShooter(
      profile({ competesInWomensClasses: true }),
      'issf-rapid-fire-pistol',
      2026,
      [ISSF_REGULATION_ID, SVSF_REGULATION_ID],
    );

    expect(events.map((e) => e.id)).toEqual([
      'issf-rapid-fire-pistol:open:open',
      'issf-rapid-fire-pistol:men:open',
      'issf-rapid-fire-pistol:men:junior',
      'issf-rapid-fire-pistol:open:junior',
    ]);
  });

  it('offers nothing from a regelverk that is not in play', () => {
    expect(rankEventsForShooter(profile(), 'svsf-snabbluftpistol', 2026, ISSF)).toEqual([]);
    expect(rankEventsForShooter(profile(), 'svsf-snabbluftpistol', 2026).map((e) => e.id)).toEqual([
      'svsf-snabbluftpistol:open:open',
      'svsf-snabbluftpistol:open:junior',
    ]);
  });

  it('asks each event its own junior age: 21 is a junior in fripistol, not in snabbluftpistol', () => {
    // Born 2005 is 21 in 2026 — inside 1.5.1's limit on an ISSF gren, past
    // 1.5.2's on SvSF's own.
    const born2005 = profile({ birthYear: 2005 });

    expect(rankEventsForShooter(born2005, 'issf-free-pistol', 2026).map((e) => e.id)).toEqual([
      'issf-free-pistol:men:open',
      'issf-free-pistol:men:junior',
      'issf-free-pistol:open:open',
      'issf-free-pistol:open:junior',
      'issf-free-pistol:women:open',
      'issf-free-pistol:women:junior',
    ]);
    expect(rankEventsForShooter(born2005, 'svsf-snabbluftpistol', 2026).map((e) => e.id)).toEqual([
      'svsf-snabbluftpistol:open:open',
      'svsf-snabbluftpistol:open:junior',
    ]);
    expect(isEligibleForEvent(born2005, findEvent('issf-free-pistol:open:junior')!, 2026)).toBe(
      true,
    );
    expect(isEligibleForEvent(born2005, findEvent('svsf-snabbluftpistol:open:junior')!, 2026)).toBe(
      false,
    );
    // A year younger clears both.
    const born2006 = profile({ birthYear: 2006 });
    expect(isEligibleForEvent(born2006, findEvent('svsf-snabbluftpistol:open:junior')!, 2026)).toBe(
      true,
    );
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

describe('categoryKey', () => {
  it('names an open-age category by its gender alone', () => {
    expect(categoryKey({ gender: 'women', age: 'open' })).toBe('women');
    expect(categoryKey({ gender: 'open', age: 'open' })).toBe('open');
  });

  it('glues the age on when there is one', () => {
    expect(categoryKey({ gender: 'men', age: 'junior' })).toBe('menJunior');
    expect(categoryKey({ gender: 'open', age: 'veteranYounger' })).toBe('openVeteranYounger');
  });

  it("names SvSF's open classes, which the i18n files carry as open/openJunior", () => {
    expect(categoryKey({ gender: 'open', age: 'open' })).toBe('open');
    expect(categoryKey({ gender: 'open', age: 'junior' })).toBe('openJunior');
  });
});

/**
 * Top-level and identifier-titled so reqstool can match this testcase back to
 * its annotation — see the convention in ADR 0015.
 *
 * @SVCs SVC_DISC_002
 */
it('events_are_narrowed_to_the_enabled_regelverk_but_a_stored_id_still_resolves', () => {
  const svsfOpenRapidFire = eventId('issf-rapid-fire-pistol', OPEN_CATEGORY);
  const issfOnly = eventsForDiscipline('issf-rapid-fire-pistol', [ISSF_REGULATION_ID]);
  expect(issfOnly.map((event) => event.id)).not.toContain(svsfOpenRapidFire);
  const withSvsf = eventsForDiscipline('issf-rapid-fire-pistol', [
    ISSF_REGULATION_ID,
    SVSF_REGULATION_ID,
  ]);
  expect(withSvsf.map((event) => event.id)).toContain(svsfOpenRapidFire);
  // Switching SvSF off must not blank out a session already logged under it.
  expect(findEvent(svsfOpenRapidFire)?.regulationId).toBe(SVSF_REGULATION_ID);
});
