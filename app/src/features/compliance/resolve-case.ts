// Which case within the compliance profile applies to this shooter — the
// explicit Settings choice if there is one, otherwise the profile's derived
// default (issue #286).
import {
  getProfileDefinition,
  resolveDefaultVariantIdFor,
  type FirearmOwnershipFact,
  type ProfileSelection,
} from '@shotledger/shared';

export interface ResolvedComplianceCase {
  /** The case to apply; null when no profile is selected. */
  variantId: string | null;
  /** True only when the shooter chose this case themselves in Settings. */
  isExplicit: boolean;
}

/**
 * The stored choice wins whenever the profile still offers it. Everything
 * else — no choice, or one the profile has retired — falls through to the
 * derived default, which is recomputed on every read rather than written
 * back: a derivation must move the default, never author a choice.
 */
export function resolveComplianceCase(
  selection: ProfileSelection,
  storedVariantId: string | null,
  facts: readonly FirearmOwnershipFact[],
): ResolvedComplianceCase {
  const definition = getProfileDefinition(selection);
  if (!definition) return { variantId: null, isExplicit: false };

  const isExplicit =
    storedVariantId !== null && definition.variants.some((v) => v.id === storedVariantId);
  return {
    variantId: isExplicit ? storedVariantId : resolveDefaultVariantIdFor(definition, facts),
    isExplicit,
  };
}
