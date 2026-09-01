// Firearm detail data (§4 M4): groups, license history + status, maintenance
// history + status, all from the M1/M4 query layer. Refetches on focus.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  licenseStatus,
  maintenanceProgress,
  maintenanceStatus,
  type LicenseStatus,
  type MaintenanceStatus,
} from '@shotledger/shared';

import { db } from '@/db/client';
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
}

const EMPTY: FirearmDetail = {
  firearm: null,
  groups: [],
  licenses: [],
  maintenanceEvents: [],
  licenseStatus: 'none',
  maintenanceStatus: 'unknown',
  maintenanceProgress: null,
};

export function loadFirearmDetail(firearmId: string): FirearmDetail {
  if (!db) return EMPTY;
  const firearm = getFirearm(db, firearmId);
  if (!firearm) return EMPTY;

  const licenses = listLicenses(db, firearmId);
  return {
    firearm,
    groups: listFirearmGroups(db, firearmId),
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
  };
}

export function useFirearmDetail(firearmId: string): { detail: FirearmDetail; refresh: () => void } {
  const [detail, setDetail] = useState<FirearmDetail>(() => loadFirearmDetail(firearmId));
  const refresh = useCallback(() => setDetail(loadFirearmDetail(firearmId)), [firearmId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { detail, refresh };
}
