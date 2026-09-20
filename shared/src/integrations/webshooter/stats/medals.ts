// Dual-path medal counting — the better of a fixed-threshold and a
// relative-placement path wins (spec §6.5, v2 spec §B.3). Reuses
// shared/src/scoring/standardMedal.ts for the fixed-threshold path — no new
// threshold table.
import { standardMedalForSession, type StandardMedalGrade } from '../../../scoring/standard-medal';
import type { CompetitionResultForStats } from './pb';

export function fixedThresholdMedal(result: CompetitionResultForStats): StandardMedalGrade | null {
  const hasFinal = result.totalSeriesCount !== result.beforeFinalSeriesCount;
  const { grade } = standardMedalForSession({
    disciplineId: result.competitionType,
    weaponGroup: result.weaponGroup,
    hasFinal,
    beforeFinalSeriesCount: result.beforeFinalSeriesCount,
    beforeFinalTenths: result.beforeFinalTenths,
    totalSeriesCount: result.totalSeriesCount,
    totalTenths: result.totalTenths,
  });
  return grade;
}

export interface RelativePlacementInput {
  placement: number;
  fieldSize: number;
  /**
   * How many competitors are tied AT the cutoff placement (spec §6.5: "ties
   * included at the cutoff"). This module cannot derive that count from a
   * placement/fieldSize pair alone — the caller supplies it. Default 0.
   */
  tiedAtCutoffCount?: number;
}

/** Silver = best 1/9 (rounded down); brons = best 1/3 (rounded down); SHB C.5.1.2. */
export function relativePlacementMedal(input: RelativePlacementInput): 'silver' | 'brons' | null {
  const tiedAtCutoffCount = input.tiedAtCutoffCount ?? 0;
  const silverCutoff = Math.floor(input.fieldSize / 9) + tiedAtCutoffCount;
  const bronsCutoff = Math.floor(input.fieldSize / 3) + tiedAtCutoffCount;
  if (input.placement <= silverCutoff) return 'silver';
  if (input.placement <= bronsCutoff) return 'brons';
  return null;
}

export type MedalGrade = 'guld' | 'silver' | 'brons' | 'none';

export const MEDAL_RANK: Record<MedalGrade, number> = {
  guld: 3,
  silver: 2,
  brons: 1,
  none: 0,
};

function toMedalGrade(grade: StandardMedalGrade | 'silver' | 'brons' | null): MedalGrade {
  return grade ?? 'none';
}

/** Higher-ranked medal wins; equal non-none ranks are a tie. */
export function betterMedal(a: MedalGrade, b: MedalGrade): MedalGrade {
  return MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b;
}

export interface DualPathMedalResult {
  grade: 'brons' | 'silver' | null;
  source: 'fixed' | 'relative' | 'tie';
}

/**
 * The better of the two paths wins (spec §6.5). `source` records which path
 * produced the result (or `'tie'` when both agree) for UI transparency
 * ("...(poänggräns)" vs "...(placering)", v2 spec §B.3).
 */
export function dualPathMedal(
  fixedResult: StandardMedalGrade | null,
  relativeResult: 'silver' | 'brons' | null,
): DualPathMedalResult {
  const fixedGrade = toMedalGrade(fixedResult);
  const relativeGrade = toMedalGrade(relativeResult);

  // MEDAL_RANK is a bijection grade<->rank, so equal rank means equal grade
  // (including the both-none case, where fixedResult/relativeResult are both
  // null and `??` naturally yields null — no separate both-none branch needed).
  if (MEDAL_RANK[fixedGrade] === MEDAL_RANK[relativeGrade]) {
    return { grade: fixedResult ?? relativeResult, source: 'tie' };
  }
  // Ranks differ here (the equal-rank case, including both-none, already
  // returned above), so the winner is always non-none.
  const winner = betterMedal(fixedGrade, relativeGrade) as 'brons' | 'silver';
  return {
    grade: winner,
    source: winner === fixedGrade ? 'fixed' : 'relative',
  };
}
