// The overall license-activity status, as the phone's Home chip shows it
// (`useOverallLicenseActivity` in app/src/features/compliance/). Same profile
// resolution as `useComplianceProfile`, same inputs as `listComplianceSessions`
// and `listAllFirearmGroupIds`, read from the pulled rows. Pure.
import {
  computeOverallLicenseActivity,
  getProfile,
  resolveComplianceCase,
  type ComplianceSession,
  type LicenseActivityStatus,
} from '@shotledger/shared/src/compliance';
import { readAccountSettings } from '@shotledger/shared/src/sync-client/account-settings';

import type { PulledTables } from './pull';
import { ownershipFacts } from './settings/model';
import { liveRows } from './stats-inputs';

/**
 * Null when no profile is stored (the web cannot know the phone's language
 * default; web-settings-edit-spec R13), when the profile is "none", or when
 * it has no rule to report: the cases where the phone shows no chip.
 */
export function overallLicenseActivity(
  tables: Pick<PulledTables, 'sessions' | 'firearms' | 'firearm_groups' | 'settings'>,
  now: Date = new Date(),
): LicenseActivityStatus | null {
  const settings = readAccountSettings(tables.settings);
  if (settings.complianceProfile === null) return null;
  const { variantId } = resolveComplianceCase(
    settings.complianceProfile,
    settings.complianceProfileVariant,
    ownershipFacts(tables.firearms),
  );
  const profile = getProfile(settings.complianceProfile, variantId ?? undefined);
  if (!profile) return null;
  const sessions = liveRows<ComplianceSession>(tables.sessions).map(
    ({ id, startedAt, type, weaponGroup, firearmId }) => ({
      id,
      startedAt,
      type,
      weaponGroup,
      firearmId,
    }),
  );
  const groupIds = [
    ...new Set(liveRows<{ groupId: string }>(tables.firearm_groups).map((g) => g.groupId)),
  ];
  return computeOverallLicenseActivity(sessions, profile, groupIds, now).overall;
}
