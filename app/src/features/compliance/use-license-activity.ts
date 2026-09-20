// M6 (§6.6): license-activity data for Home (overall) and Firearms (per firearm),
// built on shared/compliance + listComplianceSessions. Refetches on focus,
// same pattern as every other M2+ data hook.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  computeFirearmLicenseActivity,
  computeOverallLicenseActivity,
  type LicenseActivityStatus,
  type JurisdictionProfile,
  type WeaponGroupLicenseActivity,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listComplianceSessions } from '@/db/queries/compliance';
import { listAllFirearmGroupIds, listFirearmGroups } from '@/db/queries/firearm-groups';

export interface OverallLicenseActivityData {
  overall: LicenseActivityStatus | null;
  statuses: WeaponGroupLicenseActivity[];
}

function loadOverallLicenseActivity(
  profile: JurisdictionProfile | null,
): OverallLicenseActivityData {
  if (!db || !profile) return { overall: null, statuses: [] };
  const sessions = listComplianceSessions(db);
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

/** Worst-of statuses for a single firearm — one chip per firearm on lists. */
export function loadFirearmLicenseActivityStatus(
  profile: JurisdictionProfile | null,
  firearmId: string,
): LicenseActivityStatus | null {
  if (!db || !profile) return null;
  const groups = listFirearmGroups(db, firearmId).map((g) => g.groupId);
  if (groups.length === 0) return null;
  const sessions = listComplianceSessions(db);
  const statuses = computeFirearmLicenseActivity(sessions, profile, groups);
  if (statuses.length === 0) return null;
  const rank: Record<LicenseActivityStatus, number> = { red: 0, amber: 1, green: 2 };
  return statuses.reduce(
    (worst, s) => (rank[s.status] < rank[worst] ? s.status : worst),
    'green' as LicenseActivityStatus,
  );
}
