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

export interface JurisdictionProfile {
  id: JurisdictionProfileId;
  name: { sv: string; en: string };
  rules: WeaponGroupComplianceRule[];
  /** Citation shown in the UI (e.g. "FAP 551-3 — VERIFY, unconfirmed"). */
  source: string;
  /** false ⇒ UI must show an "unverified defaults" hint. */
  verified: boolean;
}

export type BarometerStatus = 'green' | 'amber' | 'red';

export interface WeaponGroupBarometer {
  weaponGroups: string[];
  windowMonths: number;
  requiredActivities: number;
  activityCount: number;
  status: BarometerStatus;
  windowStartIso: string;
}
