// The five synced account settings, read from pulled rows and turned into
// the changes one web Save pushes (docs/specs/web-settings-edit-spec.md §3.1).
// Pure: change ids and the clock are injected. Allowed values are the
// phone's own lists, never restated here.
import {
  getProfileDefinition,
  PROFILE_SELECTIONS,
  type ProfileSelection,
} from '../compliance/profile-registry';
import { birthYearOptions, SKILL_CLASSES, type SkillClass } from '../disciplines/eligibility';
import { isSyncableSettingRow, SYNCED_SETTING_KEYS, type ClientChange } from '../sync/protocol';
import { newSettingRow, type Payload } from './rows';

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

export interface SettingsError {
  key: SyncedSettingKey;
  kind: 'notAllowed';
}

export type SettingsResult =
  { ok: true; changes: ClientChange[] } | { ok: false; errors: SettingsError[] };

export interface SettingsDeps {
  newChangeId: () => string;
  now: () => string;
  currentYear: number;
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

/** Anything the phone would not have written reads as unset (spec C7). */
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

/** Whether `after[key]` is a value the phone's Settings could have written. */
function allowed(key: SyncedSettingKey, after: AccountSettings, currentYear: number): boolean {
  const value = after[key];
  switch (key) {
    case 'birthYear':
      return birthYearOptions(currentYear).includes(value as number);
    case 'skillClass':
      return isSkillClass(value);
    case 'competesInWomensClasses':
      return typeof value === 'boolean';
    case 'complianceProfile':
      return isProfile(value);
    case 'complianceProfileVariant':
      return (
        getProfileDefinition(after.complianceProfile ?? 'none')?.variants.some(
          (variant) => variant.id === value,
        ) ?? false
      );
  }
}

/**
 * One whole settings row per key whose value changed, in
 * SYNCED_SETTING_KEYS order. Unchanged keys are neither checked nor pushed;
 * one disallowed value refuses the whole build.
 */
export function buildSettingsChanges(
  before: AccountSettings,
  after: AccountSettings,
  pulled: ReadonlyMap<string, Payload>,
  deps: SettingsDeps,
): SettingsResult {
  const changed = SYNCED_SETTING_KEYS.filter((key) => before[key] !== after[key]);
  const errors: SettingsError[] = changed
    .filter((key) => !allowed(key, after, deps.currentYear))
    .map((key) => ({ key, kind: 'notAllowed' }));
  if (errors.length > 0) return { ok: false, errors };

  const now = deps.now();
  const changes = changed.map((key): ClientChange => ({
    clientChangeId: deps.newChangeId(),
    tableName: 'settings',
    rowId: key,
    payload: newSettingRow(key, after[key], now, pulled.get(key)),
    deletedAt: null,
    updatedAt: now,
  }));
  return { ok: true, changes };
}
