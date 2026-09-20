// Swedish jurisdiction profile: FAP 551-3 5 kap 5–6 §§ as transcribed on
// page 3 of PM 551.24. Numbers and their reading: ../constants-se.ts and
// docs/specs/compliance-fap551-spec.md.
import { GENERIC_WEAPON_GROUPS, SPSF_WEAPON_GROUPS } from '../../disciplines/groups';
import {
  SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES,
  SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES,
  SE_SOURCE_CITATION,
  SE_VERIFIED,
  SE_WINDOW_MONTHS,
} from '../constants-se';
import type { FirearmOwnershipFact, JurisdictionProfileDefinition } from '../types';

/** 5 § — "för den som inte tidigare har enhandsvapen för målskjutning". */
export const SE_FIRST_HANDGUN_VARIANT = 'firstHandgun';

/** 6 § — "för den som sedan tidigare innehar enhandsvapen för målskjutning". */
export const SE_EXISTING_HANDGUN_VARIANT = 'existingHandgun';

/**
 * The weapon types that count as `enhandsvapen` for 5–6 §§. `airgun` is
 * excluded: it covers air pistols and air rifles alike here, and an air
 * pistol below the Swedish licensing threshold is not a held enhandsvapen —
 * the app cannot tell those apart, and excluding it errs toward the stricter
 * 5 § case. A conservative app-level choice, not a claim about what the
 * police count. See docs/specs/firearm-ownership-spec.md.
 */
export const SE_HANDGUN_WEAPON_TYPES: readonly string[] = ['pistol', 'revolver'];

/**
 * 6 § applies to someone who "sedan tidigare innehar enhandsvapen för
 * målskjutning" — so a handgun, and one the shooter holds themselves.
 * Ownership is a plain boolean defaulting to true, so a shooter with a
 * handgun on file is taken to hold it unless they say otherwise.
 */
export function deriveSeVariantId(facts: readonly FirearmOwnershipFact[]): string {
  const ownsHandgun = facts.some(
    (fact) =>
      fact.isOwn && fact.weaponType !== null && SE_HANDGUN_WEAPON_TYPES.includes(fact.weaponType),
  );
  return ownsHandgun ? SE_EXISTING_HANDGUN_VARIANT : SE_FIRST_HANDGUN_VARIANT;
}

// One rule across every weapon group: 5–6 §§ set a single activity level for
// the shooter, with no per-vapengrupp differentiation. (The per-firearm
// "ytterligare enhandsvapen" rule does differentiate, and is deliberately not
// modeled — see the spec.)
const ALL_WEAPON_GROUP_IDS = [
  ...SPSF_WEAPON_GROUPS.map((g) => g.id),
  ...GENERIC_WEAPON_GROUPS.map((g) => g.id),
];

function seRule(requiredActivities: number) {
  return {
    weaponGroups: ALL_WEAPON_GROUP_IDS,
    windowMonths: SE_WINDOW_MONTHS,
    requiredActivities,
    // The form pools "föreningens skjutningar (träning eller tävling)" with
    // external competitions representing the club — no weighting between them.
    countsAs: { training: 1, competition: 1 },
  };
}

export const SE_PROFILE: JurisdictionProfileDefinition = {
  id: 'se',
  name: { sv: 'Sverige (FAP 551-3)', en: 'Sweden (FAP 551-3)' },
  variants: [
    { id: SE_FIRST_HANDGUN_VARIANT, rules: [seRule(SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES)] },
    { id: SE_EXISTING_HANDGUN_VARIANT, rules: [seRule(SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES)] },
  ],
  // The stricter case when nothing is known: it can under-report a 6 §
  // shooter, which sends them to the setting; the lax one would over-report a
  // 5 § shooter, which does not. A UX choice, not a regulatory fact.
  defaultVariantId: SE_FIRST_HANDGUN_VARIANT,
  deriveDefaultVariantId: deriveSeVariantId,
  source: SE_SOURCE_CITATION,
  verified: SE_VERIFIED,
};
