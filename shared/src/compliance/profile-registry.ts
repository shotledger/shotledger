import { SE_PROFILE } from './profiles/se';
import type {
  FirearmOwnershipFact,
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
 * license activity into "no requirement at all".
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

/**
 * The default case for a definition, given what is known about the shooter's
 * firearms. A profile with no derivation keeps its declared default.
 */
export function resolveDefaultVariantIdFor(
  definition: JurisdictionProfileDefinition,
  facts: readonly FirearmOwnershipFact[],
): string {
  return definition.deriveDefaultVariantId
    ? definition.deriveDefaultVariantId(facts)
    : definition.defaultVariantId;
}

/**
 * The case to apply when the shooter has made no explicit choice — derived
 * from their firearms where the profile knows how (for `se`: owning a handgun
 * makes them a FAP 551-3 6 § case). `null` for `'none'`, which has no cases.
 *
 * This is a DEFAULT, never an override: callers resolve a stored choice first
 * and only fall back here. Deriving at read time rather than writing the
 * result to settings is deliberate — the app must not author a choice on the
 * shooter's behalf.
 */
export function resolveDefaultVariantId(
  selection: ProfileSelection,
  facts: readonly FirearmOwnershipFact[] = [],
): string | null {
  const definition = getProfileDefinition(selection);
  if (!definition) return null;
  return resolveDefaultVariantIdFor(definition, facts);
}
