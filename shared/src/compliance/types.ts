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

/**
 * What a rule counts. The distinction is regulatory, not cosmetic:
 *
 * - `shooter` — a requirement on the person, so every session in the window
 *   counts whatever gun it was shot with. FAP 551-3 5–6 §§ are this shape:
 *   "deltagit i föreningens skjutningar ... sammantaget i genomsnitt minst
 *   N gånger per månad" names no weapon group.
 * - `weaponGroups` — a requirement tied to particular vapengrupper, so only
 *   sessions carrying one of them count.
 *
 * Modeling 5–6 §§ as `weaponGroups` over every known group was wrong in a way
 * that only showed up on real data: a session with no vapengrupp recorded
 * matched no group and silently failed to count (#319).
 */
export type ComplianceRuleScope = 'shooter' | 'weaponGroups';

interface ComplianceRuleBase {
  windowMonths: number;
  requiredActivities: number;
  countsAs: ActivityWeighting;
}

export interface ShooterComplianceRule extends ComplianceRuleBase {
  scope: 'shooter';
}

export interface WeaponGroupComplianceRule extends ComplianceRuleBase {
  scope: 'weaponGroups';
  /** Federation-scoped weapon-group ids this rule applies to. */
  weaponGroups: string[];
}

export type ComplianceRule = ShooterComplianceRule | WeaponGroupComplianceRule;

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
  rules: ComplianceRule[];
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
  rules: ComplianceRule[];
  /** Citation shown in the UI. */
  source: string;
  /** false ⇒ UI must show an "unverified defaults" hint. */
  verified: boolean;
}

export type LicenseActivityStatus = 'green' | 'amber' | 'red';

export interface LicenseActivity {
  /** Which rule produced this — what the UI must say the count is *of*. */
  scope: ComplianceRuleScope;
  /** The groups counted, for a `weaponGroups` rule; empty for `shooter`. */
  weaponGroups: string[];
  windowMonths: number;
  requiredActivities: number;
  /** Weighted count: what the requirement is measured against. */
  activityCount: number;
  /**
   * Sessions in the window that the rule counted, unweighted. Equal to
   * `activityCount` while every weight is 1, and kept separate so a profile
   * that ever weights a session type cannot make the screen claim a session
   * count it does not have.
   */
  countedSessionCount: number;
  /**
   * Sessions inside the window that the rule did NOT count. Always 0 for a
   * `shooter` rule, by construction. For a `weaponGroups` rule it is the
   * honesty figure #319 was filed over: a screen showing a total this rule
   * derived must be able to say how many sessions it left out.
   */
  skippedSessionCount: number;
  status: LicenseActivityStatus;
  windowStartIso: string;
}
