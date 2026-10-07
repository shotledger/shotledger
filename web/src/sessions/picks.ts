// The photos picked to compare, in pick order. They belong to the loaded
// account (its tables), so a sign-in as someone else never shows them.

export interface Picks {
  owner: object | null;
  ids: readonly string[];
}

export const NO_PICKS: Picks = { owner: null, ids: [] };

/** The picks of the account whose tables are `owner`; none for any other. */
export function picksOf(picks: Picks, owner: object): readonly string[] {
  return picks.owner === owner ? picks.ids : [];
}

export function withPicks(owner: object, ids: readonly string[]): Picks {
  return { owner, ids };
}

export function togglePick(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}

export function addPicks(ids: readonly string[], more: readonly string[]): string[] {
  return [...ids, ...more.filter((id) => !ids.includes(id))];
}

export function removePick(ids: readonly string[], id: string): string[] {
  return ids.filter((other) => other !== id);
}
