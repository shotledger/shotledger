// Dual-path medal counting — the better of a fixed-threshold and a
// relative-placement path wins (spec §6.5, v2 spec §B.3). Reuses
// shared/src/scoring/standardmedalj.ts for the fixed-threshold path — no new
// threshold table.
import {
  standardmedaljForSession,
  type StandardmedaljValor,
} from '../../../scoring/standardmedalj';
import type { CompetitionResultForStats } from './pb';

export function fixedThresholdMedal(result: CompetitionResultForStats): StandardmedaljValor | null {
  const hasFinal = result.totalSeriesCount !== result.beforeFinalSeriesCount;
  const { valor } = standardmedaljForSession({
    disciplineId: result.competitionType,
    weaponGroup: result.weaponGroup,
    hasFinal,
    beforeFinalSeriesCount: result.beforeFinalSeriesCount,
    beforeFinalTenths: result.beforeFinalTenths,
    totalSeriesCount: result.totalSeriesCount,
    totalTenths: result.totalTenths,
  });
  return valor;
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

export type MedalValor = 'guld' | 'silver' | 'brons' | 'none';

export const MEDAL_RANK: Record<MedalValor, number> = {
  guld: 3,
  silver: 2,
  brons: 1,
  none: 0,
};

function toMedalValor(valor: StandardmedaljValor | 'silver' | 'brons' | null): MedalValor {
  return valor ?? 'none';
}

/** Higher-ranked medal wins; equal non-none ranks are a tie. */
export function betterMedal(a: MedalValor, b: MedalValor): MedalValor {
  return MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b;
}

export interface DualPathMedalResult {
  valor: 'brons' | 'silver' | null;
  source: 'fixed' | 'relative' | 'tie';
}

/**
 * The better of the two paths wins (spec §6.5). `source` records which path
 * produced the result (or `'tie'` when both agree) for UI transparency
 * ("...(poänggräns)" vs "...(placering)", v2 spec §B.3).
 */
export function dualPathMedal(
  fixedResult: StandardmedaljValor | null,
  relativeResult: 'silver' | 'brons' | null,
): DualPathMedalResult {
  const fixedValor = toMedalValor(fixedResult);
  const relativeValor = toMedalValor(relativeResult);

  // MEDAL_RANK is a bijection valor<->rank, so equal rank means equal valor
  // (including the both-none case, where fixedResult/relativeResult are both
  // null and `??` naturally yields null — no separate both-none branch needed).
  if (MEDAL_RANK[fixedValor] === MEDAL_RANK[relativeValor]) {
    return { valor: fixedResult ?? relativeResult, source: 'tie' };
  }
  // Ranks differ here (the equal-rank case, including both-none, already
  // returned above), so the winner is always non-none.
  const winner = betterMedal(fixedValor, relativeValor) as 'brons' | 'silver';
  return {
    valor: winner,
    source: winner === fixedValor ? 'fixed' : 'relative',
  };
}
