// Which klasser a shooter may enter, and which they probably mean.
//
// A shooter does not sit in one klass. A woman of 62 in skill class 2,
// shooting C, is eligible for **C 2**, **C Dam 2** and **C Vet Y** at the same
// time, and picks one per competition (maintainer, 2026-09-12). The nine SPSF
// klasser are two dimensions wearing one list:
//
//   skill    1 · 2 · 3
//   category open · Jun · Dam · Vet Y · Vet Ä
//
// Most of it is derivable rather than stored. Age categories fall out of the
// birth year the app already holds, and they are YEAR-based in both
// federations — SPSF's Jun is "≤ the year turning 20" (SHB F.2.1 p. 163) and
// ISSF's junior runs until "the 31st December of the year in which they
// become 21 years of age" (Rule 3.7.4.12). So a birth year is enough; a full
// date of birth would be data we never need. An event carries its own
// junior age, because SvSF uses ISSF's 21 on ISSF grenar and 20 on its own
// (allmänna bestämmelser 1.5.1/1.5.2).
//
// Nothing here GATES anything. It produces a default and an offer; the
// session screen always allows an override, because a shooter at a club
// evening may enter a class this function would not have predicted.
import type { ShooterClass } from './classes';
import {
  SPSF_CLASS_DEFINITIONS,
  eventsForDiscipline,
  type AgeCategory,
  type EntryCategory,
  type EventDefinition,
  type GenderCategory,
} from './entries';

/** SPSF skill classes. The 1u/1b/1s variants of 1 are deliberately not offered. */
export type SkillClass = '1' | '2' | '3';

/** The skill classes a shooter can pick, in order (Settings → Personal). */
export const SKILL_CLASSES: readonly SkillClass[] = ['1', '2', '3'];

/** The birth years Settings offers, newest first: ages 10 to 100. */
export function birthYearOptions(currentYear: number): number[] {
  const years: number[] = [];
  for (let year = currentYear - 10; year >= currentYear - 100; year--) years.push(year);
  return years;
}

export interface ShooterProfile {
  /** Year only — both federations define age categories by year, not by date. */
  birthYear: number | null;
  /**
   * One class across all vapengrupper (maintainer ruling, 2026-09-12): the
   * "C 2" convention prints the gun and the class together rather than
   * describing a class held per gun.
   */
  skillClass: SkillClass | null;
  /**
   * Whether the shooter competes in women's classes and events.
   *
   * Stored as a competition fact rather than as a gender, because that is
   * exactly what both federations key off and all the app ever needs: SPSF's
   * Dam 1/2/3 are classes within a discipline, while ISSF's are separate
   * EVENTS — 25 m Pistol is recognized for women and for junior men, but not
   * for senior men; 25 m Rapid Fire has no women's version at all (Rule 3.3).
   * One attribute, two different uses.
   */
  competesInWomensClasses: boolean;
}

/** SPSF: the year the shooter turns 20 or earlier (SHB F.2.1 p. 163). */
export const SPSF_JUNIOR_MAX_AGE = 20;
const VET_YOUNGER_AGE = 60;
const VET_OLDER_AGE = 70;

/**
 * Whether a shooter may enter a given category this year.
 *
 * Both axes must hold — that is what makes the split worth having. A junior
 * woman qualifies for `{ gender: 'women', age: 'junior' }` only by satisfying
 * each independently, and ISSF's 10 m Air Pistol Junior Women is exactly that
 * conjunction.
 *
 * The one rule both carriers share: SPSF asks it of a klass, ISSF asks it of
 * an event, and neither needs to know how the other is shaped.
 */
export function isEligibleForCategory(
  profile: ShooterProfile,
  category: EntryCategory,
  year: number,
  juniorMaxAge: number = SPSF_JUNIOR_MAX_AGE,
): boolean {
  return (
    matchesGender(profile, category.gender) && matchesAge(profile, category.age, year, juniorMaxAge)
  );
}

function matchesGender(profile: ShooterProfile, gender: GenderCategory): boolean {
  switch (gender) {
    case 'open':
      return true;
    case 'women':
      return profile.competesInWomensClasses;
    // `men` is the absence of a women's entry rather than a second stored
    // fact: ISSF's men's events are what a shooter who does not compete in
    // the women's ones enters.
    case 'men':
      return !profile.competesInWomensClasses;
  }
}

function matchesAge(
  profile: ShooterProfile,
  age: AgeCategory,
  year: number,
  juniorMaxAge: number,
): boolean {
  if (age === 'open') return true;
  if (profile.birthYear === null) return false;
  const reached = ageInYear(profile.birthYear, year);
  switch (age) {
    case 'junior':
      return reached <= juniorMaxAge;
    case 'veteranYounger':
      return reached >= VET_YOUNGER_AGE;
    case 'veteranOlder':
      return reached >= VET_OLDER_AGE;
  }
}

/**
 * A discipline's events with the ones this shooter may enter first.
 *
 * Ranked, never filtered by eligibility — the same contract as the SPSF klass
 * list. Filtering would mean a Swedish woman shooting snabbpistol at a club
 * evening has nothing to log it under, and this module does not gate (see
 * the header). `regulationIds` is a different kind of narrowing: which
 * regelverk are in play at all, not who the shooter is. An empty result means
 * the discipline has no events defined, not that the shooter is excluded
 * from all of them.
 */
export function rankEventsForShooter(
  profile: ShooterProfile,
  disciplineId: string,
  year: number,
  regulationIds?: readonly string[],
): readonly EventDefinition[] {
  const events = eventsForDiscipline(disciplineId, regulationIds);
  const eligible = events.filter((event) => isEligibleForEvent(profile, event, year));
  return [...eligible, ...events.filter((event) => !eligible.includes(event))];
}

/** Whether this shooter may enter one specific event, at that event's junior age. */
export function isEligibleForEvent(
  profile: ShooterProfile,
  event: EventDefinition,
  year: number,
): boolean {
  return isEligibleForCategory(profile, event.category, year, event.juniorMaxAge);
}

/** Age reached during `year`, which is what a year-based category asks for. */
function ageInYear(birthYear: number, year: number): number {
  return year - birthYear;
}

export function isJunior(
  profile: ShooterProfile,
  year: number,
  maxAge: number = SPSF_JUNIOR_MAX_AGE,
): boolean {
  return profile.birthYear !== null && ageInYear(profile.birthYear, year) <= maxAge;
}

/**
 * Every SPSF klass the shooter may enter this year, in the order they are most
 * likely to want them: their own skill class first, then the categories.
 *
 * Entering a dam-, junior- or veteranklass is explicitly voluntary (SHB
 * F.2.8/F.2.9/F.2.10, "Att delta i … är frivilligt"), and F.2.2 lets those
 * shooters enter the open classes instead — so this is a list of what is
 * ALLOWED, never a list of what is required.
 *
 * Both veteran classes are offered from 70: F.2.10 defines Vet Y as everyone
 * "som under kalenderåret fyller 60 år eller mer" and Vet Ä as 70 or more, so
 * a 70-year-old is inside both definitions.
 *
 * @Requirements DISC_001
 */
export function spsfEligibleClasses(
  profile: ShooterProfile,
  year: number,
  weaponGroupId?: string | null,
): ShooterClass[] {
  return SPSF_CLASS_DEFINITIONS.filter((definition) => {
    // Jun/Dam/Vet exist only in vapengrupp C (SHB F.2.1 table p. 163), so
    // "A Dam 2" is not a class anyone can enter. Skipped when no gun is
    // known yet, which is the state the session screen starts in.
    if (
      weaponGroupId !== undefined &&
      weaponGroupId !== null &&
      !definition.weaponGroupIds.includes(weaponGroupId)
    ) {
      return false;
    }
    // A klass carrying a skill level is only the shooter's if it is THEIR
    // level: a class 2 shooter is Dam 2, never Dam 3.
    if (definition.skillClass !== null && definition.skillClass !== profile.skillClass) {
      return false;
    }
    return isEligibleForCategory(profile, definition.category, year);
  }).map((definition) => definition.code);
}

/**
 * The one to preselect: the first klass the shooter is eligible for.
 *
 * In practice that is their own skill class, because the definitions list the
 * open classes before the categories — a klass 2 shooter gets `2` rather than
 * `Dam2` or `VetY`, which is the one they hold by default. A shooter with no
 * skill class recorded but an eligible age category gets that category
 * instead, which beats preselecting nothing. Null only when nothing is known.
 */
export function defaultShooterClass(profile: ShooterProfile, year: number): ShooterClass | null {
  return spsfEligibleClasses(profile, year)[0] ?? null;
}
