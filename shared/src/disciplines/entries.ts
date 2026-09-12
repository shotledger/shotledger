// Klass and event — the two shapes a federation uses to say "this entry is
// for these shooters".
//
// The structural difference, which the app has to model rather than flatten:
//
//   SPSF   one discipline, many KLASSER.  Precision is precision; C 2, C Dam 2
//          and C Vet Y are entries within it. The category rides on the CLASS.
//
//   ISSF   many EVENTS, each fixed to one category. 25 m Pistol is a women's
//          and juniors' event; 25 m Rapid Fire has never had a women's
//          version. The category rides on the EVENT — there is no "women's
//          class" inside a rapid fire event, because the event itself is the
//          men's one.
//
// What they share is the category. So `EntryCategory` is the common concept,
// and `ShooterClassDefinition` and `EventDefinition` are the two carriers of
// it. One eligibility rule then serves both: a shooter is eligible for a
// CATEGORY, and the federation decides whether that lands on a class or on an
// event.
import type { ShooterClass } from './classes';
import type { SkillClass } from './eligibility';

/**
 * Who an entry is for.
 *
 * `open` means "no restriction", not "men". SHB F.2.2 p. 163 is explicit that
 * a shooter in junior-, dam- or veteranklass may also "tävla i (öppen) klass
 * 1, 2 eller 3 alltefter kompetens" — so the open classes really are open,
 * and treating them as men's would exclude a woman from her own klass 2.
 * ISSF's 25 m Rapid Fire Pistol, by contrast, genuinely is `men`.
 */
export type EntryCategory = 'open' | 'men' | 'women' | 'junior' | 'veteranYounger' | 'veteranOlder';

/**
 * SPSF: a klass. An entry WITHIN a discipline.
 *
 * `skillClass` is the earned level the code embeds — `Dam2` is category
 * `women` at skill 2 — and is null for categories that carry no level of
 * their own, like Vet Y.
 */
export interface ShooterClassDefinition {
  code: ShooterClass;
  category: EntryCategory;
  skillClass: SkillClass | null;
  /**
   * Vapengrupper this klass may be shot in (SHB F.2.1 table, p. 163).
   *
   * Klass 1/2/3 run in A, B and C; Jun, Dam and Vet are **vapengrupp C only**
   * — F.2.8/F.2.9/F.2.10 each say "tävlas med vapen kaliber .22, vapengrupp
   * C". So "A Dam 2" is not a thing, and a model that offered it would be
   * inventing a class.
   */
  weaponGroupIds: readonly string[];
}

/**
 * ISSF: an event. A competition item in its own right, belonging to a
 * discipline and fixed to one category.
 *
 * A discipline may have several — 10 m Air Pistol runs as both a men's and a
 * women's event — or exactly one, where the event IS the discipline as far as
 * entry is concerned.
 */
export interface EventDefinition {
  /** Stable id, `<disciplineId>:<category>`. */
  id: string;
  disciplineId: string;
  category: EntryCategory;
}

export function eventId(disciplineId: string, category: EntryCategory): string {
  return `${disciplineId}:${category}`;
}

/** Every SPSF klass, decomposed into the two dimensions its code encodes. */
const OPEN_GROUPS = ['spsf:A', 'spsf:B', 'spsf:C'] as const;
const C_ONLY = ['spsf:C'] as const;

export const SPSF_CLASS_DEFINITIONS: readonly ShooterClassDefinition[] = [
  { code: '1', category: 'open', skillClass: '1', weaponGroupIds: OPEN_GROUPS },
  { code: '2', category: 'open', skillClass: '2', weaponGroupIds: OPEN_GROUPS },
  { code: '3', category: 'open', skillClass: '3', weaponGroupIds: OPEN_GROUPS },
  { code: 'Jun', category: 'junior', skillClass: null, weaponGroupIds: C_ONLY },
  { code: 'Dam1', category: 'women', skillClass: '1', weaponGroupIds: C_ONLY },
  { code: 'Dam2', category: 'women', skillClass: '2', weaponGroupIds: C_ONLY },
  { code: 'Dam3', category: 'women', skillClass: '3', weaponGroupIds: C_ONLY },
  { code: 'VetY', category: 'veteranYounger', skillClass: null, weaponGroupIds: C_ONLY },
  { code: 'VetÄ', category: 'veteranOlder', skillClass: null, weaponGroupIds: C_ONLY },
];

/**
 * ISSF pistol events, by the category each is shot in.
 *
 * Only what has been confirmed is listed. Sources, checked 2026-09-12:
 * 10 m Air Pistol runs as separate men's and women's events; 25 m Pistol is
 * shot internationally only by women and juniors; 25 m Rapid Fire Pistol has
 * never had a women's version.
 *
 * VERIFY: 50 m Pistol (`issf-free-pistol`) and 25 m Standard Pistol are not
 * listed — their men/women column in ISSF Rule 8.11 has not been read into
 * docs/reference/issf-rules.md, and hard rule 4 forbids guessing a regulatory
 * value. (Note that issf-rules.md:171 has 50 m Pistol still IN Rule 8.11,
 * which contradicts ADR 0011's aside that ISSF dropped it; that aside is about
 * SvSF keeping 50 m pistol as an *icke officiell gren*, not about ISSF.)
 */
export const ISSF_EVENTS: readonly EventDefinition[] = [
  { id: eventId('issf-air-pistol', 'men'), disciplineId: 'issf-air-pistol', category: 'men' },
  { id: eventId('issf-air-pistol', 'women'), disciplineId: 'issf-air-pistol', category: 'women' },
  {
    id: eventId('issf-sport-pistol', 'women'),
    disciplineId: 'issf-sport-pistol',
    category: 'women',
  },
  {
    id: eventId('issf-rapid-fire-pistol', 'men'),
    disciplineId: 'issf-rapid-fire-pistol',
    category: 'men',
  },
];

/**
 * The events a discipline offers.
 *
 * A discipline with none defined yields a single `open` event, so an
 * unconfirmed discipline stays fully usable rather than disappearing.
 */
export function eventsForDiscipline(disciplineId: string): readonly EventDefinition[] {
  const defined = ISSF_EVENTS.filter((event) => event.disciplineId === disciplineId);
  if (defined.length > 0) return defined;
  return [{ id: eventId(disciplineId, 'open'), disciplineId, category: 'open' }];
}
