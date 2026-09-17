// M6 (§6.6): licence-activity data for Home (overall) and Firearms (per firearm),
// built on shared/compliance + listComplianceSessions. Refetches on focus,
// same pattern as every other M2+ data hook.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  computeFirearmLicenceActivity,
  computeOverallLicenceActivity,
  type LicenceActivityStatus,
  type JurisdictionProfile,
  type WeaponGroupLicenceActivity,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listComplianceSessions } from '@/db/queries/compliance';
import { listAllFirearmGroupIds, listFirearmGroups } from '@/db/queries/firearm-groups';

export interface OverallLicenceActivityData {
  overall: LicenceActivityStatus | null;
  statuses: WeaponGroupLicenceActivity[];
}

function loadOverallLicenceActivity(
  profile: JurisdictionProfile | null,
): OverallLicenceActivityData {
  if (!db || !profile) return { overall: null, statuses: [] };
  const sessions = listComplianceSessions(db);
  const groupIds = listAllFirearmGroupIds(db);
  return computeOverallLicenceActivity(sessions, profile, groupIds);
}

export function useOverallLicenceActivity(
  profile: JurisdictionProfile | null,
): OverallLicenceActivityData {
  const [data, setData] = useState<OverallLicenceActivityData>(() =>
    loadOverallLicenceActivity(profile),
  );

  useFocusEffect(
    useCallback(() => {
      setData(loadOverallLicenceActivity(profile));
    }, [profile]),
  );

  return data;
}

/** Worst-of statuses for a single firearm — one chip per firearm on lists. */
export function loadFirearmLicenceActivityStatus(
  profile: JurisdictionProfile | null,
  firearmId: string,
): LicenceActivityStatus | null {
  if (!db || !profile) return null;
  const groups = listFirearmGroups(db, firearmId).map((g) => g.groupId);
  if (groups.length === 0) return null;
  const sessions = listComplianceSessions(db);
  const statuses = computeFirearmLicenceActivity(sessions, profile, groups);
  if (statuses.length === 0) return null;
  const rank: Record<LicenceActivityStatus, number> = { red: 0, amber: 1, green: 2 };
  return statuses.reduce(
    (worst, s) => (rank[s.status] < rank[worst] ? s.status : worst),
    'green' as LicenceActivityStatus,
  );
}
