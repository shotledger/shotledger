// "The shooter wants this site" — stored per provider, read by Settings
// (which offers the toggle) and by Tools (which shows only what is on).
//
// Enablement is not connection: a provider can be enabled and not yet
// connected. Keeping them apart is what lets Tools stay clean without
// hiding a site the shooter has merely not signed into yet.
import { providerEnabledSettingKey } from '@shotledger/shared/src/integrations/providers/registry';
import { useCallback, useState } from 'react';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';

export function isProviderEnabled(id: string): boolean {
  return getSetting<boolean>(db, providerEnabledSettingKey(id), false);
}

export function useProviderEnabled(id: string): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(() => isProviderEnabled(id));

  const set = useCallback(
    (next: boolean) => {
      setEnabled(next);
      setSetting<boolean>(db, providerEnabledSettingKey(id), next);
    },
    [id],
  );

  return [enabled, set];
}
