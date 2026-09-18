// Jurisdiction-profile engine data model. Spec: m6-compliance-spec.md
// "Data model". §6.6 of docs/implementation-plan.md.

export type ComplianceSessionType = 'training' | 'competition';

/** Session-level input — an activity is one session, never a series. */
export interface ComplianceSession {
  id: string;
  /** ISO 8601. */
  startedAt: string;
  type: ComplianceSessionType;
  /** The gun: federation-scoped weapon-group id, e.g. 'spsf:C'. */
  weaponGroup?: string | null;
}

/** Per-session-type weight; 0 excludes that type from the count. */
export interface ActivityWeighting {
  training: number;
  competition: number;
}

export interface WeaponGroupComplianceRule {
  /** Federation-scoped weapon-group ids this rule applies to. */
  weaponGroups: string[];
  windowMonths: number;
  requiredActivities: number;
  countsAs: ActivityWeighting;
}

export type JurisdictionProfileId = 'se';

/**
 * What a profile may read off the shooter's firearms to pick a default case.
 * `weaponType` is the app's own id ('pistol' | 'revolver' | 'rifle' |
 * 'airgun'), left as a string so no app enum leaks in here; `null` where the
 * shooter recorded none.
 */
export interface FirearmOwnershipFact {
  weaponType: string | null;
  /** `true` the shooter's own, `false` borrowed / club-owned / another's. */
  isOwn: boolean;
}

/**
 * A case within a profile. The shooter picks it in Settings; absent a choice,
 * the profile's `deriveDefaultVariantId` may propose one from their firearms
 * (for `se`: whether they already own a handgun, which decides between FAP
 * 551-3 5 § and 6 §). The id is opaque here — the app maps it to an i18n
 * label, so no jurisdiction's wording leaks into shared machinery.
 */
export interface ComplianceProfileVariant {
  id: string;
  rules: WeaponGroupComplianceRule[];
}

/** A profile as declared. `getProfile` resolves one variant of it. */
export interface JurisdictionProfileDefinition {
  id: JurisdictionProfileId;
  name: { sv: string; en: string };
  variants: ComplianceProfileVariant[];
  /** Applied when the shooter has not chosen, or chose an unknown id. */
  defaultVariantId: string;
  /**
   * Optional: a better default than `defaultVariantId`, worked out from the
   * shooter's firearms. Only ever moves the DEFAULT — an explicit choice is
   * resolved before this is consulted. Must return one of `variants`.
   */
  deriveDefaultVariantId?: (facts: readonly FirearmOwnershipFact[]) => string;
  source: string;
  verified: boolean;
}

/** A definition resolved to one variant — what every consumer works with. */
export interface JurisdictionProfile {
  id: JurisdictionProfileId;
  name: { sv: string; en: string };
  /** Which variant produced `rules`. */
  variantId: string;
  rules: WeaponGroupComplianceRule[];
  /** Citation shown in the UI. */
  source: string;
  /** false ⇒ UI must show an "unverified defaults" hint. */
  verified: boolean;
}

export type LicenceActivityStatus = 'green' | 'amber' | 'red';

export interface WeaponGroupLicenceActivity {
  weaponGroups: string[];
  windowMonths: number;
  requiredActivities: number;
  activityCount: number;
  status: LicenceActivityStatus;
  windowStartIso: string;
}
