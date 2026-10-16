// License activity on the web (#796), from the pulled rows: the overall status
// the phone's Home chip shows (`useOverallLicenseActivity` in
// app/src/features/compliance/) and the License Check the chip opens
// (`useLicenseCheck`). Same profile resolution as `useComplianceProfile`, same
// inputs as `listComplianceSessions`, `listAllFirearmGroupIds`,
// `listActiveFirearms` and `latestLicense`. Pure.
import {
  computeOverallLapse,
  computeOverallLicenseActivity,
  getProfile,
  resolveComplianceCase,
  type ComplianceSession,
  type JurisdictionProfile,
  type LicenseActivityStatus,
} from '@shotledger/shared/src/compliance';
import { readAccountSettings } from '@shotledger/shared/src/sync-client/account-settings';

import {
  buildLicenseCheck,
  type LicenseCheck,
  type LicenseCheckFirearm,
} from '../../app/src/features/compliance/license-check';
import { pickableFirearms } from './firearms/active';
import type { PulledTables } from './pull';
import { ownershipFacts } from './settings/model';
import { liveRows } from './stats-inputs';

type ComplianceTables = Pick<PulledTables, 'sessions' | 'firearms' | 'firearm_groups' | 'settings'>;

/**
 * The shooter's jurisdiction profile, or null when none is stored (the web
 * cannot know the phone's language default; web-settings-edit-spec R13) or the
 * stored one is "none".
 */
export function licenseProfile(
  tables: Pick<PulledTables, 'firearms' | 'settings'>,
): JurisdictionProfile | null {
  const settings = readAccountSettings(tables.settings);
  if (settings.complianceProfile === null) return null;
  const { variantId } = resolveComplianceCase(
    settings.complianceProfile,
    settings.complianceProfileVariant,
    ownershipFacts(tables.firearms),
  );
  return getProfile(settings.complianceProfile, variantId ?? undefined) ?? null;
}

/** `listComplianceSessions`: every live session, with the fields the rules read. */
export function complianceSessions(tables: Pick<PulledTables, 'sessions'>): ComplianceSession[] {
  return liveRows<ComplianceSession>(tables.sessions).map(
    ({ id, startedAt, type, weaponGroup, firearmId }) => ({
      id,
      startedAt,
      type,
      weaponGroup,
      firearmId,
    }),
  );
}

/** `listAllFirearmGroupIds`: groups of live, unarchived firearms only. */
export function groupIds(tables: Pick<PulledTables, 'firearm_groups' | 'firearms'>): string[] {
  const active = pickableFirearms(tables.firearms);
  return [
    ...new Set(
      liveRows<{ groupId: string; firearmId: string }>(tables.firearm_groups)
        .filter((g) => active.has(g.firearmId))
        .map((g) => g.groupId),
    ),
  ];
}

export interface OverallLicenseActivity {
  status: LicenseActivityStatus;
  /** When the status stops being green with nothing more logged (#795); null when it is not. */
  lapseIso: string | null;
}

/**
 * Null when there is no profile, when it has no rule to report, or when
 * Settings → Features hides license activity: the cases where the phone's Home
 * shows no status.
 */
export function overallLicenseActivity(
  tables: ComplianceTables,
  now: Date = new Date(),
): OverallLicenseActivity | null {
  if (!readAccountSettings(tables.settings).showLicenseActivity) return null;
  const profile = licenseProfile(tables);
  if (!profile) return null;
  const sessions = complianceSessions(tables);
  const groups = groupIds(tables);
  const status = computeOverallLicenseActivity(sessions, profile, groups, now).overall;
  if (status === null) return null;
  return { status, lapseIso: computeOverallLapse(sessions, profile, groups, now) };
}

/** `latestLicense`: the live license with the highest (time-ordered) id. */
function latestLicenseRow(
  licenses: PulledTables['licenses'],
  firearmId: string,
): Record<string, unknown> | null {
  let latest: Record<string, unknown> | null = null;
  for (const row of liveRows<Record<string, unknown>>(licenses)) {
    if (row.firearmId !== firearmId) continue;
    if (latest === null || String(row.id) > String(latest.id)) latest = row;
  }
  return latest;
}

/** `listActiveFirearms`, ordered by make, as the License Check's firearms. */
function checkFirearms(tables: Pick<PulledTables, 'firearms' | 'licenses'>): LicenseCheckFirearm[] {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return [...pickableFirearms(tables.firearms).values()]
    .sort((a, b) => (text(a.make) < text(b.make) ? -1 : text(a.make) > text(b.make) ? 1 : 0))
    .map((row) => {
      const id = String(row.id);
      return {
        name: `${text(row.make)} ${text(row.model)}`.trim(),
        fact: {
          id,
          weaponType: typeof row.weapon_type === 'string' ? row.weapon_type : null,
          isOwn: Boolean(row.is_own),
          // `valid_until` null means "tills vidare", as on the phone.
          hasTimeLimitedPermit: latestLicenseRow(tables.licenses, id)?.validUntil != null,
        },
      };
    });
}

/** The phone's `useLicenseCheck`; null when there is no profile. */
export function licenseCheck(
  tables: ComplianceTables & Pick<PulledTables, 'licenses'>,
  now: Date = new Date(),
): LicenseCheck | null {
  const profile = licenseProfile(tables);
  if (!profile) return null;
  return buildLicenseCheck(
    complianceSessions(tables),
    profile,
    groupIds(tables),
    checkFirearms(tables),
    now,
  );
}
