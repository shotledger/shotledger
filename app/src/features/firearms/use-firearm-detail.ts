// Firearm detail data (§4 M4): groups, license history + status, maintenance
// history + status, sight settings (#114), all from the query layer.
// Refetches on focus.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  computeFirearmLicenseActivity,
  licenseStatus,
  maintenanceProgress,
  maintenanceStatus,
  type JurisdictionProfile,
  type LicenseStatus,
  type MaintenanceStatus,
  type LicenseActivity,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listComplianceSessions } from '@/db/queries/compliance';
import { listFirearmCalibers } from '@/db/queries/firearm-calibers';
import { listFirearmGroups } from '@/db/queries/firearm-groups';
import { getFirearm } from '@/db/queries/firearms';
import { listLicenses } from '@/db/queries/licenses';
import { listMaintenanceEvents } from '@/db/queries/maintenance-events';
import { listSightSettings } from '@/db/queries/sight-settings';

export interface FirearmDetail {
  firearm: NonNullable<ReturnType<typeof getFirearm>> | null;
  groups: ReturnType<typeof listFirearmGroups>;
  calibers: ReturnType<typeof listFirearmCalibers>;
  licenses: ReturnType<typeof listLicenses>;
  maintenanceEvents: ReturnType<typeof listMaintenanceEvents>;
  sightSettings: ReturnType<typeof listSightSettings>;
  licenseStatus: LicenseStatus;
  maintenanceStatus: MaintenanceStatus;
  maintenanceProgress: number | null;
  /** M6: one entry per applicable compliance rule; empty when profile is 'none'. */
  licenseActivities: LicenseActivity[];
}

const EMPTY: FirearmDetail = {
  firearm: null,
  groups: [],
  calibers: [],
  licenses: [],
  maintenanceEvents: [],
  sightSettings: [],
  licenseStatus: 'none',
  maintenanceStatus: 'unknown',
  maintenanceProgress: null,
  licenseActivities: [],
};

export function loadFirearmDetail(
  firearmId: string,
  profile: JurisdictionProfile | null = null,
): FirearmDetail {
  if (!db) return EMPTY;
  const firearm = getFirearm(db, firearmId);
  if (!firearm) return EMPTY;

  const licenses = listLicenses(db, firearmId);
  const groups = listFirearmGroups(db, firearmId);
  const calibers = listFirearmCalibers(db, firearmId);
  const licenseActivities = profile
    ? computeFirearmLicenseActivity(
        listComplianceSessions(db),
        profile,
        groups.map((g) => g.groupId),
      )
    : [];
  return {
    firearm,
    groups,
    calibers,
    licenses,
    maintenanceEvents: listMaintenanceEvents(db, firearmId),
    sightSettings: listSightSettings(db, firearmId),
    licenseStatus: licenseStatus(licenses[0]?.validUntil),
    maintenanceStatus: maintenanceStatus(
      firearm.roundsSinceMaintenance,
      firearm.maintenanceIntervalRounds,
    ),
    maintenanceProgress: maintenanceProgress(
      firearm.roundsSinceMaintenance,
      firearm.maintenanceIntervalRounds,
    ),
    licenseActivities,
  };
}

export function useFirearmDetail(
  firearmId: string,
  profile: JurisdictionProfile | null = null,
): { detail: FirearmDetail; refresh: () => void } {
  const [detail, setDetail] = useState<FirearmDetail>(() => loadFirearmDetail(firearmId, profile));
  const refresh = useCallback(
    () => setDetail(loadFirearmDetail(firearmId, profile)),
    [firearmId, profile],
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { detail, refresh };
}
