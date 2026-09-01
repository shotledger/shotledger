// Pure scoring math per docs/implementation-plan.md §3/§6.3: derived values
// are computed, never stored. value_tenths is one integer storage for both
// scoring modes (§3) — sums stay integer, dividing by 10 only at display time.

export interface ScoredShot {
  valueTenths: number;
}

/** Sums value_tenths across shots. Callers pre-filter sighters/deletions. */
export function sumValueTenths(shotsList: readonly ScoredShot[]): number {
  return shotsList.reduce((sum, shot) => sum + shot.valueTenths, 0);
}

/** Session/series score total in display units (e.g. 470 tenths -> 47.0). */
export function tenthsToScore(valueTenths: number): number {
  return valueTenths / 10;
}
