// Loads the license check (license-check.ts) from the database; refetches on
// focus like the other compliance hooks.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { JurisdictionProfile } from '@shotledger/shared';

import { db } from '@/db/client';
import { listComplianceSessions } from '@/db/queries/compliance';
import { listAllFirearmGroupIds } from '@/db/queries/firearm-groups';
import { listFirearms } from '@/db/queries/firearms';
import { latestLicense } from '@/db/queries/licenses';

import { buildLicenseCheck, type LicenseCheck } from './license-check';

export type { CriterionCheck, LicenseCheck, RuleCheck } from './license-check';

function loadLicenseCheck(profile: JurisdictionProfile | null): LicenseCheck | null {
  if (!profile) return null;
  const firearms = listFirearms(db).map((firearm) => ({
    name: `${firearm.make} ${firearm.model}`.trim(),
    fact: {
      id: firearm.id,
      weaponType: firearm.weaponType,
      isOwn: firearm.isOwn,
      // `valid_until` NULL means "tills vidare": a date there is the time
      // limit the renewal criterion turns on, as on the firearm detail.
      hasTimeLimitedPermit: latestLicense(db, firearm.id)?.validUntil != null,
    },
  }));
  return buildLicenseCheck(
    listComplianceSessions(db),
    profile,
    listAllFirearmGroupIds(db),
    firearms,
  );
}

export function useLicenseCheck(profile: JurisdictionProfile | null): LicenseCheck | null {
  const [data, setData] = useState<LicenseCheck | null>(() => loadLicenseCheck(profile));
  useFocusEffect(
    useCallback(() => {
      setData(loadLicenseCheck(profile));
    }, [profile]),
  );
  return data;
}
