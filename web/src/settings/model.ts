// The Settings page's form (docs/specs/web-settings-edit-spec.md §3.2). Pure.
// Defaults and the case derivation are the phone's own (spec C3).
import type { FirearmOwnershipFact } from '@shotledger/shared/src/compliance';
import { getProfileDefinition } from '@shotledger/shared/src/compliance/profile-registry';
import { birthYearOptions } from '@shotledger/shared/src/disciplines/eligibility';
import { SYNCED_SETTING_KEYS } from '@shotledger/shared/src/sync';
import {
  readAccountSettings,
  type AccountSettings,
} from '@shotledger/shared/src/sync-client/settings-edit';

import { resolveDefaultProfileSelection } from '../../../app/src/features/compliance/profile';
import { resolveComplianceCase } from '../../../app/src/features/compliance/resolve-case';

type Rows = ReadonlyMap<string, Record<string, unknown>>;

/** The stored settings, with an unset profile shown as the phone's default. */
export function initialSettings(rows: Rows, language: string): AccountSettings {
  const stored = readAccountSettings(rows);
  return {
    ...stored,
    complianceProfile: stored.complianceProfile ?? resolveDefaultProfileSelection(language),
  };
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

export function caseView(form: AccountSettings, facts: readonly FirearmOwnershipFact[]): CaseView {
  const selection = form.complianceProfile ?? 'none';
  const resolved = resolveComplianceCase(selection, form.complianceProfileVariant, facts);
  return {
    variantIds: getProfileDefinition(selection)?.variants.map((v) => v.id) ?? [],
    variantId: resolved.variantId,
    explicit: resolved.isExplicit,
    reasonId: resolved.reasonId,
  };
}

export function hasChanges(before: AccountSettings, after: AccountSettings): boolean {
  return SYNCED_SETTING_KEYS.some((key) => before[key] !== after[key]);
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
