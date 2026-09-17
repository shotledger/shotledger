// Firearms list data (§4 M4): each row's license + maintenance status chips,
// computed from the M1/M4 query layer. Refetches on focus, like Home/session
// detail (see app/src/features/session/use-session-detail.ts).
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  licenseStatus,
  maintenanceStatus,
  type LicenceActivityStatus,
  type JurisdictionProfile,
  type LicenseStatus,
  type MaintenanceStatus,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { latestLicense } from '@/db/queries/licenses';
import { listFirearms } from '@/db/queries/firearms';
import { loadFirearmLicenceActivityStatus } from '@/features/compliance/use-licence-activity';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';

export interface FirearmListRow {
  id: string;
  make: string;
  model: string;
  weaponType: string | null;
  licenseStatus: LicenseStatus;
  maintenanceStatus: MaintenanceStatus;
  /** M6: null when compliance profile is 'none' or the firearm has no weapon groups. */
  licenceActivityStatus: LicenceActivityStatus | null;
}

export function loadFirearmsList(profile: JurisdictionProfile | null = null): FirearmListRow[] {
  if (!db) return [];
  return listFirearms(db).map((firearm) => {
    const license = latestLicense(db!, firearm.id);
    return {
      id: firearm.id,
      make: firearm.make,
      model: firearm.model,
      weaponType: firearm.weaponType,
      licenseStatus: licenseStatus(license?.validUntil),
      maintenanceStatus: maintenanceStatus(
        firearm.roundsSinceMaintenance,
        firearm.maintenanceIntervalRounds,
      ),
      licenceActivityStatus: loadFirearmLicenceActivityStatus(profile, firearm.id),
    };
  });
}

export function useFirearmsList(): { rows: FirearmListRow[]; refresh: () => void } {
  const { profile } = useComplianceProfile();
  const [rows, setRows] = useState<FirearmListRow[]>(() => loadFirearmsList(profile));
  const refresh = useCallback(() => setRows(loadFirearmsList(profile)), [profile]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { rows, refresh };
}
