// M6 (§6.6): barometer data for Home (overall) and Firearms (per firearm),
// built on shared/compliance + listComplianceSessions. Refetches on focus,
// same pattern as every other M2+ data hook.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  computeFirearmBarometer,
  computeOverallBarometer,
  type BarometerStatus,
  type JurisdictionProfile,
  type WeaponGroupBarometer,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listComplianceSessions } from '@/db/queries/compliance';
import { listAllFirearmGroupIds, listFirearmGroups } from '@/db/queries/firearm-groups';

export interface OverallBarometerData {
  overall: BarometerStatus | null;
  statuses: WeaponGroupBarometer[];
}

function loadOverallBarometer(profile: JurisdictionProfile | null): OverallBarometerData {
  if (!db || !profile) return { overall: null, statuses: [] };
  const sessions = listComplianceSessions(db);
  const groupIds = listAllFirearmGroupIds(db);
  return computeOverallBarometer(sessions, profile, groupIds);
}

export function useOverallBarometer(profile: JurisdictionProfile | null): OverallBarometerData {
  const [data, setData] = useState<OverallBarometerData>(() => loadOverallBarometer(profile));

  useFocusEffect(
    useCallback(() => {
      setData(loadOverallBarometer(profile));
    }, [profile]),
  );

  return data;
}

/** Worst-of statuses for a single firearm — one chip per firearm on lists. */
export function loadFirearmBarometerStatus(
  profile: JurisdictionProfile | null,
  firearmId: string,
): BarometerStatus | null {
  if (!db || !profile) return null;
  const groups = listFirearmGroups(db, firearmId).map((g) => g.groupId);
  if (groups.length === 0) return null;
  const sessions = listComplianceSessions(db);
  const statuses = computeFirearmBarometer(sessions, profile, groups);
  if (statuses.length === 0) return null;
  const rank: Record<BarometerStatus, number> = { red: 0, amber: 1, green: 2 };
  return statuses.reduce(
    (worst, s) => (rank[s.status] < rank[worst] ? s.status : worst),
    'green' as BarometerStatus,
  );
}
