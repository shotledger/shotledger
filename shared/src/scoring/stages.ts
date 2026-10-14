// Delmoment (stage) subtotals and the ranking tie-break built on them.
// Spec: docs/specs/helmatch-result-spec.md.

/** One series' total, tagged with the program stage it belongs to. */
export interface StagedSeriesTotal {
  stage: string | null;
  isSighter: boolean;
  /** A särskjutning series is never part of a delmoment result (S2). Absent = false. */
  isShootOff?: boolean;
  totalTenths: number;
}

export interface StageSubtotal {
  stage: string;
  totalTenths: number;
}

/**
 * Each listed stage's result: the sum of its non-sighter series, in the
 * order given. A sighter is never part of a delmoment result (SHB I.6.6.2
 * puts it before the delmoment, not in it); a series whose stage is not
 * listed moves nothing.
 *
 * @Requirements SCORE_008
 */
export function stageSubtotals(
  stages: readonly string[],
  series: readonly StagedSeriesTotal[],
): StageSubtotal[] {
  return stages.map((stage) => ({
    stage,
    totalTenths: series
      .filter((entry) => entry.stage === stage && !entry.isSighter && entry.isShootOff !== true)
      .reduce((sum, entry) => sum + entry.totalTenths, 0),
  }));
}

/**
 * The stages that break a tie, in order. Nationell helmatch: "den som har
 * högst poäng i delmoment C går före, därefter i delmoment B" (SHB 2026
 * I.6.11.2.1 p. 265) — never A.
 */
const TIE_BREAK_STAGES: Readonly<Record<string, readonly string[]>> = {
  'spsf-helmatch': ['C', 'B'],
};

/**
 * The keys a tie on the total is broken on; empty for most disciplines.
 *
 * @Requirements SCORE_008
 */
export function tieBreakTenths(
  disciplineId: string,
  series: readonly StagedSeriesTotal[],
): number[] {
  const stages = Object.hasOwn(TIE_BREAK_STAGES, disciplineId)
    ? TIE_BREAK_STAGES[disciplineId]!
    : [];
  return stageSubtotals(stages, series).map((subtotal) => subtotal.totalTenths);
}

export interface RankedResult {
  totalTenths: number;
  tieBreakTenths: readonly number[];
}

/**
 * Whether `a` ranks strictly ahead of `b`: a higher total, or an equal total
 * and a higher first differing tie-break key, compared over the keys both
 * carry. A complete tie ranks neither ahead, so a caller keeping the first
 * seen keeps it.
 *
 * @Requirements SCORE_008
 */
export function ranksAhead(a: RankedResult, b: RankedResult): boolean {
  if (a.totalTenths !== b.totalTenths) return a.totalTenths > b.totalTenths;
  const shared = Math.min(a.tieBreakTenths.length, b.tieBreakTenths.length);
  for (let i = 0; i < shared; i += 1) {
    if (a.tieBreakTenths[i] !== b.tieBreakTenths[i]) {
      return a.tieBreakTenths[i]! > b.tieBreakTenths[i]!;
    }
  }
  return false;
}
