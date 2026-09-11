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

/**
 * Webshooter series-level-total granularity (spec Amendment WS1,
 * docs/specs/webshooter-app-spec.md): a series with no per-shot detail,
 * only a stored total and the shot count backing it. `shots` on the
 * carrying series is always `[]` when this is set.
 */
export interface SeriesTotalOverride {
  tenths: number;
  shotCount: number;
}

/** One series as the result model sees it (§6.3). */
export interface SeriesForResults {
  isSighter: boolean;
  isFinal: boolean;
  shots: readonly ScoredShot[];
  /** Set only for an imported Webshooter series with no shot rows (WS1). */
  totalOverride?: SeriesTotalOverride | null;
}

export interface SessionResults {
  /** Sum of scored (non-sighter) main-round series — the grundomgång. */
  beforeFinalTenths: number;
  /** Sum of scored (non-sighter) final series. */
  finalTenths: number;
  totalTenths: number;
  hasFinal: boolean;
}

/**
 * Centrumtia count. Since Amendment A1 (§A1.1) `isInnerTen` is set by the
 * `(X)` key only — a plain `X` is an ordinary ten and is not counted here.
 */
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
    // WS1: an override series carries its total directly — never sum
    // `shots`, which is always empty for such a series.
    const total = series.totalOverride ? series.totalOverride.tenths : sumValueTenths(series.shots);
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

/**
 * Volume metric: every shot counts, sighters included (§6.3). An override
 * series (WS1) has no `shots` rows, so it contributes its stored
 * `totalOverride.shotCount` instead — the round count must reflect shots
 * actually fired even though no per-shot detail was imported.
 */
export function shotVolume(seriesList: readonly SeriesForResults[]): number {
  return seriesList.reduce(
    (count, series) => count + (series.totalOverride?.shotCount ?? series.shots.length),
    0,
  );
}

// --- Amendment A1 §A1.2: session-header stats ---

/** A series carrying the inner-ten flag per shot (header inner-ten count). */
export interface FlaggedSeriesForResults {
  isSighter: boolean;
  isFinal: boolean;
  shots: readonly FlaggedShot[];
  /** Set only for an imported Webshooter series with no shot rows (WS1). */
  totalOverride?: SeriesTotalOverride | null;
}

/**
 * A scored series that carries data — the set every per-series mean averages
 * over. Sighters are excluded (N1); a series with no shots entered yet is
 * omitted rather than counted as 0, so adding an empty series never drags an
 * average down. Shared by `seriesAverageTenths` and `seriesInnerTenAverage`
 * so the two can never disagree about which series they cover.
 */
function isScoredWithData(series: {
  isSighter: boolean;
  shots: readonly unknown[];
  totalOverride?: SeriesTotalOverride | null;
}): boolean {
  return !series.isSighter && (series.totalOverride != null || series.shots.length > 0);
}

/**
 * Mean of the SCORED series' totals, in tenths — the "snitt/serie" shown in
 * the session header (spec A-S1..A-S6). Sighter series are excluded (N1);
 * final series are included, so a finished championship averages over its
 * grundomgång and its final together. A scored series with no shots entered
 * yet is excluded rather than counted as 0, so adding an empty series never
 * drops the running average. `null` when nothing qualifies. An override
 * series (WS1) counts as scored using its stored total — it is a
 * series-level metric, not a per-shot one, so Webshooter imports without
 * per-shot detail still contribute (spec Amendment WS1).
 */
export function seriesAverageTenths(seriesList: readonly SeriesForResults[]): number | null {
  const totals = seriesList
    .filter(isScoredWithData)
    .map((series) =>
      series.totalOverride ? series.totalOverride.tenths : sumValueTenths(series.shots),
    );
  if (totals.length === 0) return null;
  return totals.reduce((sum, total) => sum + total, 0) / totals.length;
}

/** Innertior (centrumtia count) in a session's scored series — sighter (X)s excluded (A-S7). */
export function sessionInnerTenCount(seriesList: readonly FlaggedSeriesForResults[]): number {
  return seriesList
    .filter((series) => !series.isSighter)
    .reduce((count, series) => count + countInnerTens(series.shots), 0);
}

/**
 * Mean number of innertior per SCORED series — the card's "snitt X/serie"
 * (maintainer, third review 2026-09-09). Averaged over exactly the series
 * `seriesAverageTenths` averages over, so `X ÷ series count = this figure`
 * holds for what the card shows. A plain count, not tenths; `null` when
 * nothing qualifies. An override series (WS1) has no per-shot detail, so it
 * counts in the denominator contributing 0 — the same 0 it already
 * contributes to `sessionInnerTenCount`.
 */
export function seriesInnerTenAverage(
  seriesList: readonly FlaggedSeriesForResults[],
): number | null {
  const scored = seriesList.filter(isScoredWithData);
  if (scored.length === 0) return null;
  return scored.reduce((count, series) => count + countInnerTens(series.shots), 0) / scored.length;
}
