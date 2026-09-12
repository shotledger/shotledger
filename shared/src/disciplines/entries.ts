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
 * A discipline has one event per category the federation recognizes it in —
 * 10 m Air Pistol runs as four (men, men junior, women, women junior), while
 * 25 m Rapid Fire Pistol has only the two men's ones.
 */
export interface EventDefinition {
  /** Stable id, `<disciplineId>:<gender>:<age>`. */
  id: string;
  /** The regelverk that defines it (ADR 0011), so a second one can add its own. */
  regulationId: string;
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
 * ISSF recognized events, transcribed from the two Rule 3.3 tables ("EVENTS
 * FOR MEN AND MEN JUNIOR", p. 182, and "EVENTS FOR WOMEN AND WOMEN JUNIOR",
 * p. 183) of the ISSF Rule Book, EDITION 2025, effective 1 January 2026.
 *
 * Rule 3.3 is the authority on WHICH events exist and for whom; Rule 8.11's
 * Men/Women column only says how each is shot. The status letters below are
 * the table's own, kept verbatim so a reader can diff this against the source
 * line by line — see docs/reference/issf-rules.md for the full transcription.
 *
 * The one that surprises: **25 m Pistol is `MJ only`** — recognized for men
 * ONLY as a junior event, alongside the women's and women junior ones. And
 * 25 m Standard Pistol and 50 m Pistol are both still fully recognized
 * (M, MJ, W, WJ), which is why neither needs a SvSF definition of its own.
 */
type Rule33Status = 'M' | 'MJ' | 'W' | 'WJ';

const RULE_33_CATEGORY: Record<Rule33Status, EntryCategory> = {
  M: { gender: 'men', age: 'open' },
  MJ: { gender: 'men', age: 'junior' },
  W: { gender: 'women', age: 'open' },
  WJ: { gender: 'women', age: 'junior' },
};

const ISSF_RULE_33: readonly { disciplineId: string; status: readonly Rule33Status[] }[] = [
  { disciplineId: 'issf-air-pistol', status: ['M', 'MJ', 'W', 'WJ'] },
  { disciplineId: 'issf-rapid-fire-pistol', status: ['M', 'MJ'] },
  { disciplineId: 'issf-standard-pistol', status: ['M', 'MJ', 'W', 'WJ'] },
  { disciplineId: 'issf-sport-pistol', status: ['MJ', 'W', 'WJ'] },
  { disciplineId: 'issf-free-pistol', status: ['M', 'MJ', 'W', 'WJ'] },
];

export const ISSF_EVENTS: readonly EventDefinition[] = ISSF_RULE_33.flatMap(
  ({ disciplineId, status }) =>
    status.map((code) => {
      const category = RULE_33_CATEGORY[code];
      return { id: eventId(disciplineId, category), regulationId: 'ISSF', disciplineId, category };
    }),
);

/**
 * The events a discipline offers, or an empty list when none are defined.
 *
 * Empty means "this discipline has no event dimension" — an SPSF or generic
 * one — NOT "it has one open event". A synthetic `:open:open` event would be
 * the same unknown-as-open conflation this file warns about for gender, and
 * would mint an id that dangles on a stored session.
 */
export function eventsForDiscipline(disciplineId: string): readonly EventDefinition[] {
  return ISSF_EVENTS.filter((event) => event.disciplineId === disciplineId);
}

/** One event by id, or `undefined` — a stored id may predate a definition change. */
export function findEvent(id: string): EventDefinition | undefined {
  return ISSF_EVENTS.find((event) => event.id === id);
}
