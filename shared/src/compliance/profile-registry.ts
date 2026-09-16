import { SE_PROFILE } from './profiles/se';
import type {
  JurisdictionProfile,
  JurisdictionProfileDefinition,
  JurisdictionProfileId,
} from './types';

export type ProfileSelection = 'none' | JurisdictionProfileId;

const PROFILES: Record<JurisdictionProfileId, JurisdictionProfileDefinition> = {
  se: SE_PROFILE,
};

/**
 * The profile as declared, variants included — for the Settings picker.
 * `'none'` has no definition, same rule as `getProfile`.
 */
export function getProfileDefinition(
  selection: ProfileSelection,
): JurisdictionProfileDefinition | null {
  if (selection === 'none') return null;
  return PROFILES[selection];
}

/**
 * `'none'` resolves to `null` — the §6.6 rule that the entire compliance UI
 * hides with no profile selected. Never fabricate a profile for `'none'`.
 *
 * An unknown `variantId` resolves to the definition's default rather than
 * `null` or an empty rule set: a stale stored choice must not silently turn
 * the barometer into "no requirement at all".
 */
export function getProfile(
  selection: ProfileSelection,
  variantId?: string,
): JurisdictionProfile | null {
  const definition = getProfileDefinition(selection);
  if (!definition) return null;
  const variant =
    definition.variants.find((v) => v.id === variantId) ??
    definition.variants.find((v) => v.id === definition.defaultVariantId)!;
  return {
    id: definition.id,
    name: definition.name,
    variantId: variant.id,
    rules: variant.rules,
    source: definition.source,
    verified: definition.verified,
  };
}
