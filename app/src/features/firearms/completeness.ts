// Which of a firearm's compliance-bearing fields are missing (#320).
//
// A firearm created by an import arrives as a make and a model and nothing
// else: no caliber, no weapon type, no serial number, no license. It then
// presents identically to a firearm the shooter deliberately recorded that
// way — and the difference matters, because weapon type and ownership are
// what the FAP 551-3 case derivation reads. A shooter with five licensed
// handguns was proposed the first-handgun case and given no way to see why.
//
// Pure, no DB import, so it is jest-unit-testable.

/** The fields worth prompting for, in the order the prompt lists them. */
export const FIREARM_COMPLETENESS_FIELDS = ['weaponType', 'caliber', 'license'] as const;

export type FirearmCompletenessField = (typeof FIREARM_COMPLETENESS_FIELDS)[number];

export interface FirearmCompletenessInput {
  weaponType: string | null;
  caliber: string | null;
  /** Whether any license row exists for this firearm. */
  hasLicense: boolean;
}

/**
 * Whether a missing licence is a gap worth prompting about, by weapon type.
 *
 * An air weapon that is *effektbegränsat* needs no licence in Sweden, so a 10 m
 * match air pistol with no licence row is complete, not half-filled — and the
 * app flagged it forever with nothing the shooter could do to clear it (#365).
 *
 * An app-level heuristic, not a claim about the law: `airgun` covers air
 * pistols and air rifles alike here, and a powerful air rifle above the energy
 * limit does need one. Erring this way costs an unprompted licence on a rare
 * firearm; erring the other way nags every air-pistol shooter permanently.
 * `SE_HANDGUN_WEAPON_TYPES` excludes `airgun` on the same reasoning, and the
 * two should move together if the app ever learns muzzle energy.
 */
export function requiresLicense(weaponType: string | null): boolean {
  return weaponType !== 'airgun';
}

/**
 * The missing fields, or an empty array when nothing is.
 *
 * Deliberately NOT included:
 *
 * - **serial number** — sensitive, and a shooter may reasonably decline to
 *   store it. Prompting for it would be the app nagging for data it does not
 *   need.
 * - **is_own** — it is a boolean that defaults to true, so it is never
 *   "missing", only possibly wrong.
 * - **weapon groups** — they belong to how the shooter competes, not to the
 *   firearm's identity, and no import has ever carried them.
 */
export function missingFirearmFields(
  firearm: FirearmCompletenessInput,
): FirearmCompletenessField[] {
  const missing: FirearmCompletenessField[] = [];
  if (!firearm.weaponType) missing.push('weaponType');
  if (!firearm.caliber?.trim()) missing.push('caliber');
  if (!firearm.hasLicense && requiresLicense(firearm.weaponType)) missing.push('license');
  return missing;
}

/**
 * Whether to flag this firearm at all.
 *
 * A firearm the shooter does not own needs no license of theirs, so a missing
 * license is not a gap — flagging it would tell a shooter to add paperwork for
 * a club gun. A licence-free weapon type is handled in `missingFirearmFields`
 * rather than here, because it is not a gap for anyone, owner or not.
 */
export function isFirearmIncomplete(
  firearm: FirearmCompletenessInput & { isOwn: boolean },
): boolean {
  const missing = missingFirearmFields(firearm);
  const relevant = firearm.isOwn ? missing : missing.filter((field) => field !== 'license');
  return relevant.length > 0;
}
