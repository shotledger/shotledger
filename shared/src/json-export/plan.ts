import { disciplineSeriesLength } from '../disciplines';
import { sessionVolume } from '../scoring/volume';
import type { SessionImportGroup } from './import';
import type { FirearmExport, LicenseExport } from './types';

export interface ExistingIndex {
  /** ids of non-deleted sessions already in the target DB. */
  sessionIds: ReadonlySet<string>;
  /** ids of firearms already in the target DB, for the file's `firearms`. */
  firearmIds: ReadonlySet<string>;
  /** ids of licenses already in the target DB. */
  licenseIds: ReadonlySet<string>;
  /** `"{make} {model}"` of non-deleted firearms already in the target DB. */
  firearmNames: ReadonlySet<string>;
  /** `label` of non-deleted ammo lots already in the target DB. */
  ammoLotNames: ReadonlySet<string>;
  /** `name` of non-deleted tags already in the target DB. */
  tagNames: ReadonlySet<string>;
}

export type PlanAction = 'create' | 'update' | 'reuse';

export interface SessionPlanItem {
  sessionId: string;
  name: string;
  action: 'create' | 'update';
  /** Shots in its series plus six per fält station. */
  shotCount: number;
}

export interface NamedPlanItem {
  name: string;
  action: 'create' | 'reuse';
}

export interface DryRunPlan {
  sessions: SessionPlanItem[];
  firearms: NamedPlanItem[];
  licenses: NamedPlanItem[];
  ammoLots: NamedPlanItem[];
  tags: NamedPlanItem[];
}

/** The file's firearm and license arrays, which a session references by id.
 *  Optional: a file written before they existed carries neither. */
export interface ImportRecords {
  firearms?: readonly FirearmExport[];
  licenses?: readonly LicenseExport[];
}

/** The one spelling of a firearm's name, shared by the exporter, the plan and
 *  the name-matching import path — they must agree or a firearm duplicates. */
/**
 * Rounds fired in a session from a file (`sessionVolume`). A file carries no
 * total-only series, so every series counts by its shot rows.
 */
export function importedSessionVolume(group: SessionImportGroup): number {
  return sessionVolume({
    series: group.series.map((s) => ({
      shotCount: s.shots.length,
      totalOnly: false,
      overrideShotCount: null,
    })),
    extraRounds: group.extraRounds,
    stationCount: group.stations.length,
    seriesLength: disciplineSeriesLength(group.disciplineId),
  });
}

export function firearmDisplayName(firearm: { make: string; model: string }): string {
  return `${firearm.make} ${firearm.model}`;
}

/** Pure reconciliation: what import will do, given the file's parsed
 * session groups and an index of what already exists in the target DB.
 * No DB access — the caller supplies the index and executes the plan. */
export function buildDryRunPlan(
  groups: readonly SessionImportGroup[],
  index: ExistingIndex,
  records: ImportRecords = {},
): DryRunPlan {
  const firearmNames = new Map<string, PlanAction>();
  const licenseNames = new Map<string, PlanAction>();
  const ammoLotNames = new Map<string, PlanAction>();
  const tagNames = new Map<string, PlanAction>();
  const sessions: SessionPlanItem[] = [];

  // The file's own firearms first: they carry an id, so they reconcile on it
  // and only fall back to the name a session would have matched on.
  for (const firearm of records.firearms ?? []) {
    const name = firearmDisplayName(firearm);
    if (firearmNames.has(name)) continue;
    const exists = index.firearmIds.has(firearm.id) || index.firearmNames.has(name);
    firearmNames.set(name, exists ? 'reuse' : 'create');
  }
  for (const license of records.licenses ?? []) {
    const name = license.licenseNumber ?? license.id;
    if (licenseNames.has(name)) continue;
    licenseNames.set(name, index.licenseIds.has(license.id) ? 'reuse' : 'create');
  }

  for (const group of groups) {
    sessions.push({
      sessionId: group.sessionId,
      name: group.name,
      action: index.sessionIds.has(group.sessionId) ? 'update' : 'create',
      // The rounds this session adds to Shots Logged (#512).
      shotCount: importedSessionVolume(group),
    });

    if (group.firearm && !firearmNames.has(group.firearm)) {
      firearmNames.set(group.firearm, index.firearmNames.has(group.firearm) ? 'reuse' : 'create');
    }
    if (group.ammoLot && !ammoLotNames.has(group.ammoLot)) {
      ammoLotNames.set(group.ammoLot, index.ammoLotNames.has(group.ammoLot) ? 'reuse' : 'create');
    }
    for (const tag of group.tags) {
      if (!tagNames.has(tag)) {
        tagNames.set(tag, index.tagNames.has(tag) ? 'reuse' : 'create');
      }
    }
  }

  const toItems = (m: Map<string, PlanAction>): NamedPlanItem[] =>
    [...m.entries()].map(([name, action]) => ({ name, action: action as 'create' | 'reuse' }));

  return {
    sessions,
    firearms: toItems(firearmNames),
    licenses: toItems(licenseNames),
    ammoLots: toItems(ammoLotNames),
    tags: toItems(tagNames),
  };
}
