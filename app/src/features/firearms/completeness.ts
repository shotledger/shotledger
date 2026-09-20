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
  if (!firearm.hasLicense) missing.push('license');
  return missing;
}

/**
 * Whether to flag this firearm at all.
 *
 * A firearm the shooter does not own needs no license of theirs, so a missing
 * license is not a gap — flagging it would tell a shooter to add paperwork for
 * a club gun.
 */
export function isFirearmIncomplete(
  firearm: FirearmCompletenessInput & { isOwn: boolean },
): boolean {
  const missing = missingFirearmFields(firearm);
  const relevant = firearm.isOwn ? missing : missing.filter((field) => field !== 'license');
  return relevant.length > 0;
}
