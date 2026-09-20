// Swedish jurisdiction profile: FAP 551-3 5 kap 5–6 §§ as transcribed on
// page 3 of PM 551.24. Numbers and their reading: ../constants-se.ts and
// docs/specs/compliance-fap551-spec.md.
import {
  SE_ADDITIONAL_HANDGUN_REQUIRED,
  SE_ADDITIONAL_HANDGUN_WINDOW_MONTHS,
  SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES,
  SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES,
  SE_RENEWAL_REQUIRED_PER_WINDOW,
  SE_RENEWAL_WINDOW_COUNT,
  SE_RENEWAL_WINDOW_MONTHS,
  SE_SOURCE_CITATION,
  SE_VERIFIED,
  SE_WINDOW_MONTHS,
} from '../constants-se';
import type {
  DerivedVariant,
  FirearmComplianceRule,
  FirearmFact,
  FirearmOwnershipFact,
  JurisdictionProfileDefinition,
  ShooterComplianceRule,
} from '../types';

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
export const SE_REASON_OWNS_HANDGUN = 'ownsHandgun';
export const SE_REASON_NO_HANDGUN_ON_FILE = 'noHandgunOnFile';
export const SE_REASON_NO_FIREARMS = 'noFirearms';

export function deriveSeVariantId(facts: readonly FirearmOwnershipFact[]): DerivedVariant {
  const ownsHandgun = facts.some(
    (fact) =>
      fact.isOwn && fact.weaponType !== null && SE_HANDGUN_WEAPON_TYPES.includes(fact.weaponType),
  );
  if (ownsHandgun) {
    return { variantId: SE_EXISTING_HANDGUN_VARIANT, reasonId: SE_REASON_OWNS_HANDGUN };
  }
  // "No firearms at all" and "firearms, but none of them a handgun you own"
  // reach the same stricter case by different routes, and the difference is
  // the whole of what a shooter needs to act on: the second is what an import
  // that lost weapon types and licenses produces (#320).
  return {
    variantId: SE_FIRST_HANDGUN_VARIANT,
    reasonId: facts.length === 0 ? SE_REASON_NO_FIREARMS : SE_REASON_NO_HANDGUN_ON_FILE,
  };
}

// 5–6 §§ are requirements on the SHOOTER, not on a vapengrupp: "deltagit i
// föreningens skjutningar (träning eller tävling) och/eller representerat
// skytteföreningen i externa tävlingar" names no weapon group, so every
// session in the window counts whatever gun it was shot with. Expressing that
// as a rule listing every known group looked equivalent and was not — a
// session with no vapengrupp recorded matched none of them and vanished from
// the count (#319), which in real imported data is the majority of sessions.
//
// (The two per-firearm criteria on the same form — "ytterligare
// enhandsvapen" and "förnyelse av tidsbegränsat tillstånd" — do differentiate,
// and are modeled separately as `firearmCriteria`; see #329.)
function seRule(requiredActivities: number): ShooterComplianceRule {
  return {
    scope: 'shooter',
    windowMonths: SE_WINDOW_MONTHS,
    requiredActivities,
    // The form pools "föreningens skjutningar (träning eller tävling)" with
    // external competitions representing the club — no weighting between them.
    countsAs: { training: 1, competition: 1 },
  };
}

/** "Ytterligare enhandsvapen" — the box about handguns already held. */
export const SE_CRITERION_ADDITIONAL_HANDGUN = 'additionalHandgun';

/** "Förnyelse av tidsbegränsat tillstånd" — the box about the applied-for gun. */
export const SE_CRITERION_RENEWAL = 'renewal';

/**
 * Both criteria say "tränat eller tävlat", so training and competition pool
 * exactly as they do for 5-6 §§.
 */
const SE_CRITERION_COUNTS_AS = { training: 1, competition: 1 };

/**
 * "Respektive tidigare innehavda enhandsvapen". The app has no licence
 * register, so the proxy is the same one the 5 §/6 § derivation uses: a
 * handgun the shooter has marked as their own. A proxy, not a licence record
 * — which is why the screen says what it counted and the manual says what it
 * cannot know.
 */
function isHeldHandgun(firearm: FirearmFact): boolean {
  return (
    firearm.isOwn &&
    firearm.weaponType !== null &&
    SE_HANDGUN_WEAPON_TYPES.includes(firearm.weaponType)
  );
}

/**
 * "Sökt vapen" on a tidsbegränsat tillstånd. The proxy is a licence row with
 * an end date — `valid_until` NULL means "tills vidare", so a date there IS
 * the time limit the criterion turns on. No weapon type is required: the
 * form's renewal box names none.
 */
function hasTimeLimitedPermit(firearm: FirearmFact): boolean {
  return firearm.hasTimeLimitedPermit;
}

const SE_FIREARM_CRITERIA: FirearmComplianceRule[] = [
  {
    criterionId: SE_CRITERION_ADDITIONAL_HANDGUN,
    windowMonths: SE_ADDITIONAL_HANDGUN_WINDOW_MONTHS,
    windowCount: 1,
    requiredActivities: SE_ADDITIONAL_HANDGUN_REQUIRED,
    countsAs: SE_CRITERION_COUNTS_AS,
    appliesTo: isHeldHandgun,
  },
  {
    criterionId: SE_CRITERION_RENEWAL,
    windowMonths: SE_RENEWAL_WINDOW_MONTHS,
    windowCount: SE_RENEWAL_WINDOW_COUNT,
    requiredActivities: SE_RENEWAL_REQUIRED_PER_WINDOW,
    countsAs: SE_CRITERION_COUNTS_AS,
    appliesTo: hasTimeLimitedPermit,
  },
];

export const SE_PROFILE: JurisdictionProfileDefinition = {
  id: 'se',
  name: { sv: 'Sverige (FAP 551-3)', en: 'Sweden (FAP 551-3)' },
  variants: [
    { id: SE_FIRST_HANDGUN_VARIANT, rules: [seRule(SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES)] },
    { id: SE_EXISTING_HANDGUN_VARIANT, rules: [seRule(SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES)] },
  ],
  // On the definition, not on a variant: these apply per firearm whichever
  // paragraph the shooter falls under.
  firearmCriteria: SE_FIREARM_CRITERIA,
  // The stricter case when nothing is known: it can under-report a 6 §
  // shooter, which sends them to the setting; the lax one would over-report a
  // 5 § shooter, which does not. A UX choice, not a regulatory fact.
  defaultVariantId: SE_FIRST_HANDGUN_VARIANT,
  deriveDefaultVariantId: deriveSeVariantId,
  source: SE_SOURCE_CITATION,
  verified: SE_VERIFIED,
};
