// Year-to-year statistics (spec §6.4, v2 spec §B.2). Grouped coarser than
// PBs — weapon GROUP only, e.g. 'C', never the full class string — so a
// deliberately different key function from stats/pb.ts's.
import type { CompetitionResultForStats } from './pb';

export function yearOverYearGroupKey(result: CompetitionResultForStats): string {
  return `${result.competitionType}:${result.weaponGroup}`;
}

export interface YearStat {
  year: number;
  count: number;
  meanTenths: number;
  medianTenths: number;
  /** null when count < 2 — same convention as shared/src/scoring/stats.ts. */
  sampleStdevTenths: number | null;
  minTenths: number;
  maxTenths: number;
  meanInnerTens: number;
}

function median(sortedValues: readonly number[]): number {
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[mid]!;
  return (sortedValues[mid - 1]! + sortedValues[mid]!) / 2;
}

function sampleStdev(values: readonly number[], mean: number): number | null {
  if (values.length < 2) return null;
  const sumSquaredDeviation = values.reduce((acc, value) => acc + (value - mean) ** 2, 0);
  return Math.sqrt(sumSquaredDeviation / (values.length - 1));
}

function yearStatFor(year: number, results: readonly CompetitionResultForStats[]): YearStat {
  const totals = results.map((result) => result.totalTenths).sort((a, b) => a - b);
  const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;
  const meanInnerTens = results.reduce((sum, result) => sum + result.innerTens, 0) / results.length;

  return {
    year,
    count: results.length,
    meanTenths: mean,
    medianTenths: median(totals),
    sampleStdevTenths: sampleStdev(totals, mean),
    minTenths: totals[0]!,
    maxTenths: totals[totals.length - 1]!,
    meanInnerTens,
  };
}

/** Grouped by (competitionType, weaponGroup), then by calendar year. */
export function yearStats(
  results: readonly CompetitionResultForStats[],
): Map<string, Map<number, YearStat>> {
  const byGroup = new Map<string, Map<number, CompetitionResultForStats[]>>();

  for (const result of results) {
    const groupKey = yearOverYearGroupKey(result);
    const byYear = byGroup.get(groupKey) ?? new Map<number, CompetitionResultForStats[]>();
    const year = new Date(result.date).getUTCFullYear();
    const bucket = byYear.get(year) ?? [];
    bucket.push(result);
    byYear.set(year, bucket);
    byGroup.set(groupKey, byYear);
  }

  const output = new Map<string, Map<number, YearStat>>();
  for (const [groupKey, byYear] of byGroup) {
    const stats = new Map<number, YearStat>();
    for (const [year, bucket] of byYear) {
      stats.set(year, yearStatFor(year, bucket));
    }
    output.set(groupKey, stats);
  }
  return output;
}

/** Sorted list of years actually present in a group (helper for "immediately preceding year with data"). */
export function yearsWithData(byYear: Map<number, YearStat>): number[] {
  return [...byYear.keys()].sort((a, b) => a - b);
}

export interface YearOverYearChange {
  absoluteTenths: number;
  percentage: number;
}

/**
 * `null` when there is no preceding year with data (spec §6.4: never treat a
 * zero-session year as a 0-value data point — the caller finds the nearest
 * preceding year via `yearsWithData`, not `year - 1`).
 */
export function yearOverYearChange(
  current: YearStat,
  previous: YearStat | null,
): YearOverYearChange | null {
  if (previous === null) return null;
  const absoluteTenths = current.meanTenths - previous.meanTenths;
  const percentage = previous.meanTenths === 0 ? 0 : (absoluteTenths / previous.meanTenths) * 100;
  return { absoluteTenths, percentage };
}

export interface TwoPointTrend {
  slopePerYear: number;
}

/**
 * Two-point slope (spec §6.4, VERIFY per v2 spec §B.2 — literally as
 * described, not "corrected" to a least-squares regression): `(last mean -
 * first mean) / (last year - first year)` over the caller-sorted input.
 * `null` for fewer than 2 distinct years.
 */
export function twoPointTrend(years: readonly YearStat[]): TwoPointTrend | null {
  if (years.length < 2) return null;
  const first = years[0]!;
  const last = years[years.length - 1]!;
  if (first.year === last.year) return null;
  return { slopePerYear: (last.meanTenths - first.meanTenths) / (last.year - first.year) };
}
