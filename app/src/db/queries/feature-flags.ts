import { getSetting, setSetting } from './settings';
import type { Database } from '../types';

// Device-local overrides for the build-time flags in constants/flags.ts, set
// from /dev. One JSON record under one settings key; a missing entry means
// "use the build value".
export const FLAG_OVERRIDES_KEY = 'flagOverrides';

export type FlagOverrides = Record<string, boolean>;

export type FlagDefinition = {
  /** The value this build ships with — its default, or an EXPO_PUBLIC_* override. */
  build: boolean;
  /** Whether /dev may flip it on a device. False for flags that gate /dev itself. */
  overridable: boolean;
};

export function resolveFlag(
  definition: FlagDefinition,
  override: boolean | undefined,
  overridesAllowed: boolean,
): boolean {
  if (overridesAllowed && definition.overridable && typeof override === 'boolean') return override;
  return definition.build;
}

export function getFlagOverrides(db: Database): FlagOverrides {
  const stored = getSetting<unknown>(db, FLAG_OVERRIDES_KEY, {});
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  );
}

/** `null` clears the override, so the flag falls back to its build value. */
export function setFlagOverride(db: Database, name: string, value: boolean | null): void {
  const { [name]: _cleared, ...rest } = getFlagOverrides(db);
  setSetting<FlagOverrides>(
    db,
    FLAG_OVERRIDES_KEY,
    value === null ? rest : { ...rest, [name]: value },
  );
}
