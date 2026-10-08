// The five synced account settings, read from pulled `settings` rows. Values
// the phone would not have written read as unset, so a caller falls back to
// the phone's own defaults. Allowed values are the phone's lists.
import { PROFILE_SELECTIONS, type ProfileSelection } from '../compliance/profile-registry';
import { SKILL_CLASSES, type SkillClass } from '../disciplines/eligibility';
import { isSyncableSettingRow, SYNCED_SETTING_KEYS } from '../sync/protocol';
import type { Payload } from './rows';

export type SyncedSettingKey = (typeof SYNCED_SETTING_KEYS)[number];

export interface AccountSettings {
  birthYear: number | null;
  skillClass: SkillClass | null;
  competesInWomensClasses: boolean;
  /** null: no choice stored; the caller shows the phone's default. */
  complianceProfile: ProfileSelection | null;
  /** null: no choice stored; the case is derived from the firearms. */
  complianceProfileVariant: string | null;
}

const isBirthYear = (value: unknown): value is number => Number.isInteger(value);
const isSkillClass = (value: unknown): value is SkillClass =>
  SKILL_CLASSES.includes(value as SkillClass);
const isProfile = (value: unknown): value is ProfileSelection =>
  PROFILE_SELECTIONS.includes(value as ProfileSelection);
const isString = (value: unknown): value is string => typeof value === 'string';

/** The stored JSON value of a live, well-formed row; undefined otherwise. */
function decoded(rows: ReadonlyMap<string, Payload>, key: SyncedSettingKey): unknown {
  const row = rows.get(key);
  if (row === undefined || !isSyncableSettingRow(key, row) || !isString(row.value)) {
    return undefined;
  }
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return undefined;
  }
}

/** Anything the phone would not have written reads as unset. */
export function readAccountSettings(rows: ReadonlyMap<string, Payload>): AccountSettings {
  const birthYear = decoded(rows, 'birthYear');
  const skillClass = decoded(rows, 'skillClass');
  const womens = decoded(rows, 'competesInWomensClasses');
  const profile = decoded(rows, 'complianceProfile');
  const variant = decoded(rows, 'complianceProfileVariant');
  return {
    birthYear: isBirthYear(birthYear) ? birthYear : null,
    skillClass: isSkillClass(skillClass) ? skillClass : null,
    competesInWomensClasses: womens === true,
    complianceProfile: isProfile(profile) ? profile : null,
    complianceProfileVariant: isString(variant) ? variant : null,
  };
}
