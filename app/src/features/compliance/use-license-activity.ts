// M6 (§6.6): license-activity data for Home (overall) and Firearms (per firearm),
// built on shared/compliance + listComplianceSessions. Refetches on focus,
// same pattern as every other M2+ data hook.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  computeFirearmLicenseActivity,
  computeOverallLicenseActivity,
  type LicenseActivity,
  type LicenseActivityStatus,
  type JurisdictionProfile,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listComplianceSessions } from '@/db/queries/compliance';
import { listAllFirearmGroupIds, listFirearmGroups } from '@/db/queries/firearm-groups';

export interface OverallLicenseActivityData {
  overall: LicenseActivityStatus | null;
  statuses: LicenseActivity[];
}

function loadOverallLicenseActivity(
  profile: JurisdictionProfile | null,
): OverallLicenseActivityData {
  if (!profile) return { overall: null, statuses: [] };
  const sessions = listComplianceSessions(db);
  // The groups are still passed — a profile may hold weapon-group rules — but
  // they no longer gate the result: a shooter-scope rule applies with an empty
  // list, which is what an import that creates no firearm_groups leaves behind
  // (#319).
  const groupIds = listAllFirearmGroupIds(db);
  return computeOverallLicenseActivity(sessions, profile, groupIds);
}

export function useOverallLicenseActivity(
  profile: JurisdictionProfile | null,
): OverallLicenseActivityData {
  const [data, setData] = useState<OverallLicenseActivityData>(() =>
    loadOverallLicenseActivity(profile),
  );

  useFocusEffect(
    useCallback(() => {
      setData(loadOverallLicenseActivity(profile));
    }, [profile]),
  );

  return data;
}

/**
 * Worst-of statuses for a single firearm — one chip per firearm on lists.
 * A firearm with no vapengrupp recorded still carries the shooter-level
 * status: 5–6 §§ apply to the person, so there is a real answer to show.
 */
export function loadFirearmLicenseActivityStatus(
  profile: JurisdictionProfile | null,
  firearmId: string,
): LicenseActivityStatus | null {
  if (!profile) return null;
  const groups = listFirearmGroups(db, firearmId).map((g) => g.groupId);
  const sessions = listComplianceSessions(db);
  const statuses = computeFirearmLicenseActivity(sessions, profile, groups);
  if (statuses.length === 0) return null;
  const rank: Record<LicenseActivityStatus, number> = { red: 0, amber: 1, green: 2 };
  return statuses.reduce(
    (worst, s) => (rank[s.status] < rank[worst] ? s.status : worst),
    'green' as LicenseActivityStatus,
  );
}
