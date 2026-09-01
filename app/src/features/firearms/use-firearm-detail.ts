// Firearm detail data (§4 M4): groups, license history + status, maintenance
// history + status, all from the M1/M4 query layer. Refetches on focus.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  computeFirearmBarometer,
  licenseStatus,
  maintenanceProgress,
  maintenanceStatus,
  type JurisdictionProfile,
  type LicenseStatus,
  type MaintenanceStatus,
  type WeaponGroupBarometer,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listComplianceSessions } from '@/db/queries/compliance';
import { listFirearmGroups } from '@/db/queries/firearm-groups';
import { getFirearm } from '@/db/queries/firearms';
import { listLicenses } from '@/db/queries/licenses';
import { listMaintenanceEvents } from '@/db/queries/maintenance-events';

export interface FirearmDetail {
  firearm: NonNullable<ReturnType<typeof getFirearm>> | null;
  groups: ReturnType<typeof listFirearmGroups>;
  licenses: ReturnType<typeof listLicenses>;
  maintenanceEvents: ReturnType<typeof listMaintenanceEvents>;
  licenseStatus: LicenseStatus;
  maintenanceStatus: MaintenanceStatus;
  maintenanceProgress: number | null;
  /** M6: one entry per applicable compliance rule; empty when profile is 'none'. */
  barometers: WeaponGroupBarometer[];
}

const EMPTY: FirearmDetail = {
  firearm: null,
  groups: [],
  licenses: [],
  maintenanceEvents: [],
  licenseStatus: 'none',
  maintenanceStatus: 'unknown',
  maintenanceProgress: null,
  barometers: [],
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
  const barometers = profile
    ? computeFirearmBarometer(
        listComplianceSessions(db),
        profile,
        groups.map((g) => g.groupId),
      )
    : [];
  return {
    firearm,
    groups,
    licenses,
    maintenanceEvents: listMaintenanceEvents(db, firearmId),
    licenseStatus: licenseStatus(licenses[0]?.validUntil),
    maintenanceStatus: maintenanceStatus(
      firearm.roundsSinceMaintenance,
      firearm.maintenanceIntervalRounds,
    ),
    maintenanceProgress: maintenanceProgress(
      firearm.roundsSinceMaintenance,
      firearm.maintenanceIntervalRounds,
    ),
    barometers,
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
