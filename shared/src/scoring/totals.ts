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

// --- M3: the result model (spec docs/specs/m3-scoring-spec.md §5) ---

export interface FlaggedShot extends ScoredShot {
  isInnerTen: boolean;
}

/** One series as the result model sees it (§6.3). */
export interface SeriesForResults {
  isSighter: boolean;
  isFinal: boolean;
  shots: readonly ScoredShot[];
}

export interface SessionResults {
  /** Sum of scored (non-sighter) main-round series — the grundomgång. */
  beforeFinalTenths: number;
  /** Sum of scored (non-sighter) final series. */
  finalTenths: number;
  totalTenths: number;
  hasFinal: boolean;
}

/** X count. The decimal (X) is a separate flag and never counted here. */
export function countInnerTens(shotsList: readonly FlaggedShot[]): number {
  return shotsList.filter((shot) => shot.isInnerTen).length;
}

/**
 * The three derived results of §6.3. Sighter series are excluded from every
 * score; `hasFinal` is true as soon as any series belongs to the final
 * section, so the UI shows the divider even before the final is scored.
 */
export function sessionResults(seriesList: readonly SeriesForResults[]): SessionResults {
  let beforeFinalTenths = 0;
  let finalTenths = 0;
  let hasFinal = false;

  for (const series of seriesList) {
    if (series.isFinal) hasFinal = true;
    if (series.isSighter) continue;
    const total = sumValueTenths(series.shots);
    if (series.isFinal) finalTenths += total;
    else beforeFinalTenths += total;
  }

  return {
    beforeFinalTenths,
    finalTenths,
    totalTenths: beforeFinalTenths + finalTenths,
    hasFinal,
  };
}

/** Volume metric: every shot counts, sighters included (§6.3). */
export function shotVolume(seriesList: readonly SeriesForResults[]): number {
  return seriesList.reduce((count, series) => count + series.shots.length, 0);
}
