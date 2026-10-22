// Which regelverk the shooter competes under (REGULATIONS.md § Regelverk).
//
// Stored one row per regulation rather than a single list, so a build that
// adds a regulation does not have to migrate anyone's stored value — a row
// that has never been written falls back to that regulation's own default.
import {
  REGULATIONS,
  defaultEnabledRegulationIds,
  regulationEnabledSettingKey,
} from '@shotledger/shared/src/regulations/registry';
import { useCallback, useState } from 'react';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';

export function isRegulationEnabled(id: string): boolean {
  const fallback = defaultEnabledRegulationIds().includes(id);
  return getSetting<boolean>(db, regulationEnabledSettingKey(id), fallback);
}

/** The enabled ids, in registry order. */
export function enabledRegulationIds(): string[] {
  return REGULATIONS.filter((regulation) => isRegulationEnabled(regulation.id)).map(
    (regulation) => regulation.id,
  );
}

export function useRegulations() {
  const [enabled, setEnabled] = useState<string[]>(() => enabledRegulationIds());

  const toggle = useCallback((id: string, next: boolean) => {
    setSetting<boolean>(db, regulationEnabledSettingKey(id), next);
    setEnabled(enabledRegulationIds());
  }, []);

  return { enabled, toggle };
}
