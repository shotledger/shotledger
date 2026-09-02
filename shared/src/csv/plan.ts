import type { SessionImportGroup } from './import';

export interface ExistingIndex {
  /** ids of non-deleted sessions already in the target DB. */
  sessionIds: ReadonlySet<string>;
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
  shotCount: number;
}

export interface NamedPlanItem {
  name: string;
  action: 'create' | 'reuse';
}

export interface DryRunPlan {
  sessions: SessionPlanItem[];
  firearms: NamedPlanItem[];
  ammoLots: NamedPlanItem[];
  tags: NamedPlanItem[];
}

/** Pure reconciliation: what import will do, given the file's parsed
 * session groups and an index of what already exists in the target DB.
 * No DB access — the caller supplies the index and executes the plan. */
export function buildDryRunPlan(
  groups: readonly SessionImportGroup[],
  index: ExistingIndex,
): DryRunPlan {
  const firearmNames = new Map<string, PlanAction>();
  const ammoLotNames = new Map<string, PlanAction>();
  const tagNames = new Map<string, PlanAction>();
  const sessions: SessionPlanItem[] = [];

  for (const group of groups) {
    sessions.push({
      sessionId: group.sessionId,
      name: group.name,
      action: index.sessionIds.has(group.sessionId) ? 'update' : 'create',
      shotCount: group.series.reduce((sum, s) => sum + s.shots.length, 0),
    });

    if (group.firearm && !firearmNames.has(group.firearm)) {
      firearmNames.set(group.firearm, index.firearmNames.has(group.firearm) ? 'reuse' : 'create');
    }
    if (group.ammoLot && !ammoLotNames.has(group.ammoLot)) {
      ammoLotNames.set(
        group.ammoLot,
        index.ammoLotNames.has(group.ammoLot) ? 'reuse' : 'create',
      );
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
    ammoLots: toItems(ammoLotNames),
    tags: toItems(tagNames),
  };
}
