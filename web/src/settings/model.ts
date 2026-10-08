// The Settings page's form (docs/specs/web-settings-edit-spec.md §3.2). Pure.
// The case derivation is the phone's own (spec C3).
import {
  resolveComplianceCase,
  type FirearmOwnershipFact,
} from '@shotledger/shared/src/compliance';
import { birthYearOptions } from '@shotledger/shared/src/disciplines/eligibility';
import { SYNCED_SETTING_KEYS } from '@shotledger/shared/src/sync';
import {
  readAccountSettings,
  type AccountSettings,
} from '@shotledger/shared/src/sync-client/account-settings';
import { offeredCases } from '@shotledger/shared/src/sync-client/settings-edit';

type Rows = ReadonlyMap<string, Record<string, unknown>>;

/**
 * The stored settings. An unset profile stays null and nothing is
 * highlighted: the phone uses its language's default, which the web cannot
 * know (spec R13). Choosing a profile writes it (R6).
 */
export function initialSettings(rows: Rows): AccountSettings {
  return readAccountSettings(rows);
}

/** What the phone's listFirearmOwnershipFacts reads, from the pulled rows. */
export function ownershipFacts(firearms: Rows): FirearmOwnershipFact[] {
  return [...firearms.values()].map((row) => ({
    weaponType: typeof row.weapon_type === 'string' ? row.weapon_type : null,
    isOwn: Boolean(row.is_own),
  }));
}

export interface CaseView {
  /** The cases the profile offers; the picker shows only when there are several. */
  variantIds: string[];
  variantId: string | null;
  /** False when the case shown was proposed from the firearms. */
  explicit: boolean;
  reasonId: string | null;
}

const NO_CASE: CaseView = { variantIds: [], variantId: null, explicit: false, reasonId: null };

/** Nothing until a profile is stored: the cases depend on it (spec R13). */
export function caseView(form: AccountSettings, facts: readonly FirearmOwnershipFact[]): CaseView {
  const selection = form.complianceProfile;
  if (selection === null) return NO_CASE;
  const resolved = resolveComplianceCase(selection, form.complianceProfileVariant, facts);
  return {
    variantIds: offeredCases(selection),
    variantId: resolved.variantId,
    explicit: resolved.isExplicit,
    reasonId: resolved.reasonId,
  };
}

/** As buildSettingsChanges counts them: a case with no profile offering one is not one (R4, R13). */
export function hasChanges(before: AccountSettings, after: AccountSettings): boolean {
  const offersCases = offeredCases(after.complianceProfile).length > 0;
  return SYNCED_SETTING_KEYS.some(
    (key) => before[key] !== after[key] && (key !== 'complianceProfileVariant' || offersCases),
  );
}

/** As on the phone: only changing a year already set is confirmed (spec C5). */
export function needsBirthYearConfirm(before: AccountSettings, after: AccountSettings): boolean {
  return before.birthYear !== null && after.birthYear !== before.birthYear;
}

/** The phone's years, plus a stored one that has aged out of them (spec C7). */
export function birthYearChoices(currentYear: number, current: number | null): number[] {
  const years = birthYearOptions(currentYear);
  return current === null || years.includes(current) ? years : [...years, current];
}
