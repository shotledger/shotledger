// Firearms list data (§4 M4): each row's license + maintenance status chips,
// computed from the M1/M4 query layer. Refetches on focus, like Home/session
// detail (see app/src/features/session/use-session-detail.ts).
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  licenseStatus,
  type LicenseActivityStatus,
  type JurisdictionProfile,
  type LicenseStatus,
  type MaintenanceStatus,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { latestLicense } from '@/db/queries/licenses';
import { listFirearms } from '@/db/queries/firearms';
import { getRoundsSinceMaintenance } from '@/db/queries/maintenance-counter';
import { lastMaintenanceAtByFirearm } from '@/db/queries/maintenance-events';
import { loadFirearmLicenseActivityStatus } from '@/features/compliance/use-license-activity';
import { isFirearmIncomplete } from './completeness';
import { firearmMaintenanceDue } from './maintenance';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';

export interface FirearmListRow {
  id: string;
  make: string;
  model: string;
  weaponType: string | null;
  licenseStatus: LicenseStatus;
  maintenanceStatus: MaintenanceStatus;
  /** M6: null when the compliance profile is 'none'. */
  licenseActivityStatus: LicenseActivityStatus | null;
  /** Missing weapon type, caliber or (for an owned firearm) a license (#320). */
  isIncomplete: boolean;
  /** Sold, returned or retired (#799): listed apart, with no status chips. */
  isArchived: boolean;
}

export function loadFirearmsList(profile: JurisdictionProfile | null = null): FirearmListRow[] {
  const lastMaintenanceAt = lastMaintenanceAtByFirearm(db);
  const now = new Date();
  return listFirearms(db).map((firearm) => {
    const license = latestLicense(db, firearm.id);
    const isArchived = firearm.archivedAt != null;
    return {
      id: firearm.id,
      make: firearm.make,
      model: firearm.model,
      weaponType: firearm.weaponType,
      licenseStatus: licenseStatus(license?.validUntil),
      maintenanceStatus: firearmMaintenanceDue(
        firearm,
        getRoundsSinceMaintenance(db, firearm),
        lastMaintenanceAt.get(firearm.id),
        now,
      ).status,
      licenseActivityStatus: isArchived
        ? null
        : loadFirearmLicenseActivityStatus(profile, firearm.id),
      isIncomplete: isFirearmIncomplete({
        weaponType: firearm.weaponType,
        caliber: firearm.caliber,
        hasLicense: license !== undefined && license !== null,
        isOwn: firearm.isOwn,
      }),
      isArchived,
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
