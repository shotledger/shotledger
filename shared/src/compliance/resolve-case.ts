// Which case within the compliance profile applies to this shooter — the
// explicit Settings choice if there is one, otherwise the profile's derived
// default (issue #286).
import {
  getProfileDefinition,
  resolveDefaultVariantIdFor,
  type ProfileSelection,
} from './profile-registry';
import type { FirearmOwnershipFact } from './types';

export interface ResolvedComplianceCase {
  /** The case to apply; null when no profile is selected. */
  variantId: string | null;
  /** True only when the shooter chose this case themselves in Settings. */
  isExplicit: boolean;
  /**
   * Why the derivation landed here — null when the shooter chose explicitly,
   * since then there is nothing to explain. A proposed case that cannot say
   * why it was proposed is not correctable (#320).
   */
  reasonId: string | null;
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
  if (!definition) return { variantId: null, isExplicit: false, reasonId: null };

  const isExplicit =
    storedVariantId !== null && definition.variants.some((v) => v.id === storedVariantId);
  if (isExplicit) return { variantId: storedVariantId, isExplicit: true, reasonId: null };

  const derived = resolveDefaultVariantIdFor(definition, facts);
  return { variantId: derived.variantId, isExplicit: false, reasonId: derived.reasonId };
}
