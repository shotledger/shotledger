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
// ISSF's junior runs "until 31 December of the year the athlete turns 21"
// (ISSF rule clarification, 2023-04-13). So a birth year is enough; a full
// date of birth would be data we never need.
//
// Nothing here GATES anything. It produces a default and an offer; the
// session screen always allows an override, because a shooter at a club
// evening may enter a class this function would not have predicted.
import type { ShooterClass } from './classes';

/** SPSF skill classes. The 1u/1b/1s variants of 1 are deliberately not offered. */
export type SkillClass = '1' | '2' | '3';

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
   * EVENTS — 25 m Pistol is women and juniors only, 25 m Rapid Fire has no
   * women's version. One attribute, two different uses.
   */
  competesInWomensClasses: boolean;
}

/** SPSF: the year the shooter turns 20 or earlier (SHB F.2.1 p. 163). */
export const SPSF_JUNIOR_MAX_AGE = 20;
/** ISSF: junior until 31 December of the year they turn 21. */
export const ISSF_JUNIOR_MAX_AGE = 21;
const VET_YOUNGER_AGE = 60;
const VET_OLDER_AGE = 70;

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
 * VERIFY: whether a shooter of 70+ may still enter Vet Y, or moves to Vet Ä
 * exclusively. SHB F.2.1 gives "Vet Y (year turning 60+), Vet Ä (year turning
 * 70+)" without saying the bands are exclusive. Both are offered from 70,
 * because this list only ever prefills an overridable picker — offering one
 * class too many costs a tap, hiding one the shooter is entitled to costs
 * them the entry.
 */
export function spsfEligibleClasses(profile: ShooterProfile, year: number): ShooterClass[] {
  const classes: ShooterClass[] = [];

  if (profile.skillClass !== null) {
    classes.push(profile.skillClass);
    if (profile.competesInWomensClasses) classes.push(`Dam${profile.skillClass}`);
  }

  if (isJunior(profile, year)) classes.push('Jun');

  if (profile.birthYear !== null) {
    const age = ageInYear(profile.birthYear, year);
    if (age >= VET_YOUNGER_AGE) classes.push('VetY');
    if (age >= VET_OLDER_AGE) classes.push('VetÄ');
  }

  return classes;
}

/**
 * The one to preselect: the shooter's own skill class when known.
 *
 * Not the veteran or Dam class, even when eligible — those are a choice made
 * per competition, while the skill class is the one they hold by default.
 * Null when nothing is known, which leaves the picker empty rather than
 * guessing.
 */
export function defaultShooterClass(profile: ShooterProfile, year: number): ShooterClass | null {
  return spsfEligibleClasses(profile, year)[0] ?? null;
}
