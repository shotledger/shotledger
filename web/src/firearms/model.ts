// The Firearms pages on the web (#796), read-only, from the pulled rows: the
// list as the phone's `loadFirearmsList` builds it
// (app/src/features/firearms/use-firearms-list.ts) and one firearm as its
// `loadFirearmDetail` does (use-firearm-detail.ts). The query functions those
// call (`listFirearms`, `latestLicense`, `listLicenses`, `listFirearmGroups`,
// `listFirearmCalibers`, `listMaintenanceEvents`, `lastMaintenanceAtByFirearm`,
// `getRoundsSinceMaintenance`, `listSightSettings`, `listComplianceSessions`,
// in app/src/db/queries/) are restated over the wire rows, ordering included;
// the math is the shared code they call. Pure.
import {
  computeFirearmCriteria,
  computeFirearmCriteriaLapses,
  computeFirearmLicenseActivity,
  computeFirearmLicenseLapses,
  type FirearmCriterionActivity,
  type JurisdictionProfile,
  type LicenseActivity,
  type LicenseActivityStatus,
} from '@shotledger/shared/src/compliance';
import {
  licenseStatus,
  maintenanceDue,
  roundsSinceMaintenance,
  type LicenseStatus,
  type MaintenanceDue,
  type MaintenanceStatus,
} from '@shotledger/shared/src/firearms';

import { isFirearmIncomplete } from '../../../app/src/features/firearms/completeness';
import { complianceSessions, licenseProfile } from '../license-activity';
import type { PulledTables } from '../pull';
import { liveRows } from '../stats-inputs';

export type FirearmTables = Pick<
  PulledTables,
  | 'firearms'
  | 'licenses'
  | 'firearm_groups'
  | 'firearm_calibers'
  | 'maintenance_events'
  | 'sight_settings'
  | 'sessions'
  | 'settings'
>;

/** A firearms row as the phone's drizzle select returns it. */
export interface Firearm {
  id: string;
  createdAt: string;
  make: string;
  model: string;
  caliber: string | null;
  weaponType: string | null;
  isOwn: boolean;
  vapenId: string | null;
  roundCount: number;
  maintenanceIntervalRounds: number | null;
  maintenanceIntervalMonths: number | null;
  archivedAt: string | null;
}

export interface License {
  id: string;
  licenseNumber: string | null;
  validUntil: string | null;
}

export interface FirearmGroup {
  id: string;
  groupId: string;
  isDefaultForGroup: number;
}

export interface FirearmCaliber {
  id: string;
  caliber: string;
  position: number;
}

export interface MaintenanceEvent {
  id: string;
  performedAt: string;
  kind: string;
  roundCountAt: number;
  notes: string | null;
  isAdjustment: number;
}

export interface SightSetting {
  id: string;
  updatedAt: string;
  label: string;
  elevationClicks: number | null;
  windageClicks: number | null;
  isActive: number;
  notes: string | null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const intOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
/** SQLite's 0/1 flags; a JSON boolean reads the same. */
const flag = (value: unknown): number => (value === true || value === 1 ? 1 : 0);

/** Ascending by a text column, as SQLite's binary ORDER BY; stable on ties. */
function byText<T>(key: (row: T) => string): (a: T, b: T) => number {
  return (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}

function toFirearm(row: Record<string, unknown>): Firearm {
  return {
    id: text(row.id),
    createdAt: text(row.createdAt),
    make: text(row.make),
    model: text(row.model),
    caliber: textOrNull(row.caliber),
    weaponType: textOrNull(row.weaponType),
    // The column is NOT NULL DEFAULT true; a row without it is the default.
    isOwn: row.isOwn === undefined || row.isOwn === null ? true : Boolean(row.isOwn),
    vapenId: textOrNull(row.vapenId),
    roundCount: intOrNull(row.roundCount) ?? 0,
    maintenanceIntervalRounds: intOrNull(row.maintenanceIntervalRounds),
    maintenanceIntervalMonths: intOrNull(row.maintenanceIntervalMonths),
    archivedAt: textOrNull(row.archivedAt),
  };
}

/** `listFirearms`: the live firearms, archived ones included, ordered by make. */
export function listFirearms(tables: Pick<PulledTables, 'firearms'>): Firearm[] {
  return liveRows<Record<string, unknown>>(tables.firearms)
    .map(toFirearm)
    .sort(byText((f) => f.make));
}

/** The live rows of one firearm in a child table. */
function rowsOf(
  table: Map<string, Record<string, unknown>>,
  firearmId: string,
): Record<string, unknown>[] {
  return liveRows<Record<string, unknown>>(table).filter((row) => row.firearmId === firearmId);
}

/** `listLicenses`: newest first by id (UUIDv7, so the latest issued first). */
export function listLicenses(tables: Pick<PulledTables, 'licenses'>, firearmId: string): License[] {
  return rowsOf(tables.licenses, firearmId)
    .map((row) => ({
      id: text(row.id),
      licenseNumber: textOrNull(row.licenseNumber),
      validUntil: textOrNull(row.validUntil),
    }))
    .sort(byText((l) => l.id))
    .reverse();
}

/**
 * `listFirearmGroups`. The phone's query has no ORDER BY and SQLite returns
 * rowid (insertion) order; the UUIDv7 id is that order here.
 */
export function listFirearmGroups(
  tables: Pick<PulledTables, 'firearm_groups'>,
  firearmId: string,
): FirearmGroup[] {
  return rowsOf(tables.firearm_groups, firearmId)
    .map((row) => ({
      id: text(row.id),
      groupId: text(row.groupId),
      isDefaultForGroup: flag(row.isDefaultForGroup),
    }))
    .sort(byText((g) => g.id));
}

/** `listFirearmCalibers`: by `position`. */
export function listFirearmCalibers(
  tables: Pick<PulledTables, 'firearm_calibers'>,
  firearmId: string,
): FirearmCaliber[] {
  return rowsOf(tables.firearm_calibers, firearmId)
    .map((row) => ({
      id: text(row.id),
      caliber: text(row.caliber),
      position: intOrNull(row.position) ?? 0,
    }))
    .sort((a, b) => a.position - b.position);
}

function maintenanceEventsOf(
  tables: Pick<PulledTables, 'maintenance_events'>,
  firearmId: string,
): MaintenanceEvent[] {
  return rowsOf(tables.maintenance_events, firearmId).map((row) => ({
    id: text(row.id),
    performedAt: text(row.performedAt),
    kind: text(row.kind),
    roundCountAt: intOrNull(row.roundCountAt) ?? 0,
    notes: textOrNull(row.notes),
    isAdjustment: flag(row.isAdjustment),
  }));
}

/** `listMaintenanceEvents`: newest first by id. */
export function listMaintenanceEvents(
  tables: Pick<PulledTables, 'maintenance_events'>,
  firearmId: string,
): MaintenanceEvent[] {
  return maintenanceEventsOf(tables, firearmId)
    .sort(byText((e) => e.id))
    .reverse();
}

/**
 * `lastMaintenanceAtByFirearm` for one firearm: the latest `performed_at` of
 * its live events that are not round-count adjustments; undefined when none.
 */
export function lastMaintenanceAt(
  tables: Pick<PulledTables, 'maintenance_events'>,
  firearmId: string,
): string | undefined {
  let latest: string | undefined;
  for (const event of maintenanceEventsOf(tables, firearmId)) {
    if (event.isAdjustment !== 0) continue;
    if (latest === undefined || event.performedAt > latest) latest = event.performedAt;
  }
  return latest;
}

/** `getRoundsSinceMaintenance`. */
export function roundsSince(
  tables: Pick<PulledTables, 'maintenance_events'>,
  firearm: Firearm,
): number {
  return roundsSinceMaintenance(firearm.roundCount, maintenanceEventsOf(tables, firearm.id));
}

/** `firearmMaintenanceDue` (app/src/features/firearms/maintenance.ts), with `maintenanceCountedFrom`. */
export function firearmMaintenanceDue(
  firearm: Firearm,
  sinceMaintenance: number,
  lastAt: string | undefined,
  now: Date,
): MaintenanceDue {
  return maintenanceDue(
    {
      roundsSinceMaintenance: sinceMaintenance,
      intervalRounds: firearm.maintenanceIntervalRounds,
      countedFrom: lastAt ?? firearm.createdAt,
      intervalMonths: firearm.maintenanceIntervalMonths,
    },
    now,
  );
}

/** `listSightSettings`: oldest first by id. */
export function listSightSettings(
  tables: Pick<PulledTables, 'sight_settings'>,
  firearmId: string,
): SightSetting[] {
  return rowsOf(tables.sight_settings, firearmId)
    .map((row) => ({
      id: text(row.id),
      updatedAt: text(row.updatedAt),
      label: text(row.label),
      elevationClicks: intOrNull(row.elevationClicks),
      windageClicks: intOrNull(row.windageClicks),
      isActive: flag(row.isActive),
      notes: textOrNull(row.notes),
    }))
    .sort(byText((s) => s.id));
}

export interface FirearmListRow {
  id: string;
  make: string;
  model: string;
  weaponType: string | null;
  licenseStatus: LicenseStatus;
  maintenanceStatus: MaintenanceStatus;
  /** Null when there is no profile, no rule applies, or the firearm is archived. */
  licenseActivityStatus: LicenseActivityStatus | null;
  isIncomplete: boolean;
  isArchived: boolean;
}

const RANK: Record<LicenseActivityStatus, number> = { red: 0, amber: 1, green: 2 };

/** `loadFirearmLicenseActivityStatus` (use-license-activity.ts): the worst of the firearm's statuses. */
function firearmLicenseActivityStatus(
  tables: FirearmTables,
  profile: JurisdictionProfile | null,
  firearmId: string,
  now: Date,
): LicenseActivityStatus | null {
  if (!profile) return null;
  const groups = listFirearmGroups(tables, firearmId).map((g) => g.groupId);
  const statuses = computeFirearmLicenseActivity(complianceSessions(tables), profile, groups, now);
  if (statuses.length === 0) return null;
  return statuses.reduce(
    (worst, s) => (RANK[s.status] < RANK[worst] ? s.status : worst),
    'green' as LicenseActivityStatus,
  );
}

/** `loadFirearmsList`: every live firearm, archived ones flagged. */
export function firearmsList(tables: FirearmTables, now: Date = new Date()): FirearmListRow[] {
  const profile = licenseProfile(tables);
  return listFirearms(tables).map((firearm) => {
    const license = listLicenses(tables, firearm.id)[0];
    const isArchived = firearm.archivedAt != null;
    return {
      id: firearm.id,
      make: firearm.make,
      model: firearm.model,
      weaponType: firearm.weaponType,
      licenseStatus: licenseStatus(license?.validUntil, now),
      maintenanceStatus: firearmMaintenanceDue(
        firearm,
        roundsSince(tables, firearm),
        lastMaintenanceAt(tables, firearm.id),
        now,
      ).status,
      licenseActivityStatus: isArchived
        ? null
        : firearmLicenseActivityStatus(tables, profile, firearm.id, now),
      isIncomplete: isFirearmIncomplete({
        weaponType: firearm.weaponType,
        caliber: firearm.caliber,
        hasLicense: license !== undefined,
        isOwn: firearm.isOwn,
      }),
      isArchived,
    };
  });
}

export interface FirearmDetail {
  firearm: Firearm;
  /** The profile the license activity was measured against; null when none. */
  profile: JurisdictionProfile | null;
  groups: FirearmGroup[];
  calibers: FirearmCaliber[];
  licenses: License[];
  maintenanceEvents: MaintenanceEvent[];
  sightSettings: SightSetting[];
  licenseStatus: LicenseStatus;
  roundsSinceMaintenance: number;
  maintenanceStatus: MaintenanceStatus;
  maintenanceDue: MaintenanceDue;
  lastMaintenanceAt: string | undefined;
  licenseActivities: LicenseActivity[];
  licenseActivityLapses: (string | null)[];
  firearmCriteria: FirearmCriterionActivity[];
  firearmCriteriaLapses: (string | null)[];
}

/** `loadFirearmDetail`; null for a firearm that is not there (or deleted). */
export function firearmDetail(
  tables: FirearmTables,
  firearmId: string,
  now: Date = new Date(),
): FirearmDetail | null {
  const row = tables.firearms.get(firearmId);
  if (!row || (row.deleted_at !== null && row.deleted_at !== undefined)) return null;
  const firearm = listFirearms({ firearms: new Map([[firearmId, row]]) })[0]!;
  const profile = licenseProfile(tables);

  const licenses = listLicenses(tables, firearmId);
  const sinceMaintenance = roundsSince(tables, firearm);
  const groups = listFirearmGroups(tables, firearmId);
  const sessions = profile ? complianceSessions(tables) : [];
  const groupIds = groups.map((g) => g.groupId);
  // `valid_until` null is "tills vidare", so a date there is the time-limited
  // permit the renewal criterion turns on; [0] is the licence in force.
  const fact = {
    id: firearm.id,
    weaponType: firearm.weaponType,
    isOwn: firearm.isOwn,
    hasTimeLimitedPermit: licenses[0]?.validUntil != null,
  };
  const lastAt = lastMaintenanceAt(tables, firearmId);
  const due = firearmMaintenanceDue(firearm, sinceMaintenance, lastAt, now);
  return {
    firearm,
    profile,
    groups,
    calibers: listFirearmCalibers(tables, firearmId),
    licenses,
    maintenanceEvents: listMaintenanceEvents(tables, firearmId),
    sightSettings: listSightSettings(tables, firearmId),
    licenseStatus: licenseStatus(licenses[0]?.validUntil, now),
    roundsSinceMaintenance: sinceMaintenance,
    maintenanceStatus: due.status,
    maintenanceDue: due,
    lastMaintenanceAt: lastAt,
    licenseActivities: profile
      ? computeFirearmLicenseActivity(sessions, profile, groupIds, now)
      : [],
    licenseActivityLapses: profile
      ? computeFirearmLicenseLapses(sessions, profile, groupIds, now)
      : [],
    firearmCriteria: computeFirearmCriteria(sessions, profile, fact, now),
    firearmCriteriaLapses: computeFirearmCriteriaLapses(sessions, profile, fact, now),
  };
}
