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
 * A case within a profile that the shooter picks, because the app cannot
 * derive it (for `se`: whether they already hold a handgun for target
 * shooting, which decides between FAP 551-3 5 § and 6 §). The id is opaque
 * here — the app maps it to an i18n label, so no jurisdiction's wording
 * leaks into shared machinery.
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
