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
 * The gender an entry is restricted to.
 *
 * `open` means "no restriction", not "men". SHB F.2.2 p. 163 is explicit that
 * a shooter in junior-, dam- or veteranklass may also "tävla i (öppen) klass
 * 1, 2 eller 3 alltefter kompetens" — so the open classes really are open,
 * and treating them as men's would exclude a woman from her own klass 2.
 * ISSF's 25 m Rapid Fire Pistol, by contrast, genuinely is `men`.
 */
export type GenderCategory = 'open' | 'women' | 'men';

/** The age band an entry is restricted to. */
export type AgeCategory = 'open' | 'junior' | 'veteranYounger' | 'veteranOlder';

/**
 * Who an entry is for — two independent axes, not one list.
 *
 * They have to be independent because ISSF multiplies them: *10 m Air Pistol
 * Junior Women* is a real event, and a single enum cannot name it. SPSF gets
 * away with a flat list only because its klasser happen to vary one axis at a
 * time — and even there the flat reading is wrong about two of them, since
 * SHB F.2.8 and F.2.10 say juniors and veterans are NOT gender-split ("Herr-
 * och damjuniorer tävlar i samma klass"; "Veteranklass kan bestå av såväl
 * herrar som damer"). As a conjunction that falls out: Jun is
 * `{ gender: 'open', age: 'junior' }`.
 */
export interface EntryCategory {
  gender: GenderCategory;
  age: AgeCategory;
}

/** Reads as `open`/`women`/`men` crossed with the age band. */
export const OPEN_CATEGORY: EntryCategory = { gender: 'open', age: 'open' };

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
  return `${disciplineId}:${category.gender}:${category.age}`;
}

/** Every SPSF klass, decomposed into the two dimensions its code encodes. */
const OPEN_GROUPS = ['spsf:A', 'spsf:B', 'spsf:C'] as const;
const C_ONLY = ['spsf:C'] as const;

/**
 * Note the `gender: 'open'` on Jun, Vet Y and Vet Ä: SHB F.2.8 and F.2.10 put
 * men and women in the same junior and veteran classes. Only Dam carries a
 * gender restriction. (F.2.3 p. 164 splits veterans by gender again when a
 * class has fewer than five entrants — a sammanslagning rule about running a
 * competition, not about who may enter, so it does not belong here.)
 */
export const SPSF_CLASS_DEFINITIONS: readonly ShooterClassDefinition[] = [
  { code: '1', category: OPEN_CATEGORY, skillClass: '1', weaponGroupIds: OPEN_GROUPS },
  { code: '2', category: OPEN_CATEGORY, skillClass: '2', weaponGroupIds: OPEN_GROUPS },
  { code: '3', category: OPEN_CATEGORY, skillClass: '3', weaponGroupIds: OPEN_GROUPS },
  {
    code: 'Jun',
    category: { gender: 'open', age: 'junior' },
    skillClass: null,
    weaponGroupIds: C_ONLY,
  },
  {
    code: 'Dam1',
    category: { gender: 'women', age: 'open' },
    skillClass: '1',
    weaponGroupIds: C_ONLY,
  },
  {
    code: 'Dam2',
    category: { gender: 'women', age: 'open' },
    skillClass: '2',
    weaponGroupIds: C_ONLY,
  },
  {
    code: 'Dam3',
    category: { gender: 'women', age: 'open' },
    skillClass: '3',
    weaponGroupIds: C_ONLY,
  },
  {
    code: 'VetY',
    category: { gender: 'open', age: 'veteranYounger' },
    skillClass: null,
    weaponGroupIds: C_ONLY,
  },
  {
    code: 'VetÄ',
    category: { gender: 'open', age: 'veteranOlder' },
    skillClass: null,
    weaponGroupIds: C_ONLY,
  },
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
function issfEvent(disciplineId: string, gender: GenderCategory): EventDefinition {
  const category: EntryCategory = { gender, age: 'open' };
  return { id: eventId(disciplineId, category), disciplineId, category };
}

export const ISSF_EVENTS: readonly EventDefinition[] = [
  issfEvent('issf-air-pistol', 'men'),
  issfEvent('issf-air-pistol', 'women'),
  issfEvent('issf-sport-pistol', 'women'),
  issfEvent('issf-rapid-fire-pistol', 'men'),
];

/**
 * The events a discipline offers, or an empty list when none are defined.
 *
 * Empty means "we have not read this discipline's categories", NOT "it has one
 * open event" — the earlier synthetic `:open:open` event was the same
 * unknown-as-open conflation this file warns about for gender, and it minted
 * ids that would dangle on a stored session once the real events landed. A
 * caller with no events simply has no event dimension to ask about, exactly as
 * ISSF disciplines have no vapengrupp to ask about.
 */
export function eventsForDiscipline(disciplineId: string): readonly EventDefinition[] {
  return ISSF_EVENTS.filter((event) => event.disciplineId === disciplineId);
}
