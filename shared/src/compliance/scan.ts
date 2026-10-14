// A forward scan over the days on which a windowed count can change. Shared by
// the lapse (#795) and the shortfall (#804). Spec:
// docs/specs/compliance-local-days-spec.md "Computing the lapse".
import { addDays, localDayStart } from './months';

/**
 * The first local midnight after `nowMs` at which `found` is true, as ISO, or
 * `null` if there is none up to the horizon.
 *
 * `found` must depend on its argument only through the local day, as every
 * status function does since windows count whole local days (#816). The answer
 * can therefore change only at a local midnight, and evaluating each one from
 * tomorrow on is exhaustive.
 *
 * Past the horizon, the latest of today and the newest instant in `times` plus
 * `reachMonths` months counted as 31 days each and one more day, every instant
 * in `times` is behind every window for good.
 *
 * @Requirements COMPL_003
 */
export function firstDayWhere(
  times: readonly number[],
  reachMonths: number,
  nowMs: number,
  found: (day: Date) => boolean,
): string | null {
  const latest = localDayStart(new Date(times.reduce((a, b) => Math.max(a, b), nowMs)));
  const horizonMs = addDays(latest, reachMonths * 31 + 1).getTime();
  for (
    let day = addDays(localDayStart(new Date(nowMs)), 1);
    day.getTime() <= horizonMs;
    day = addDays(day, 1)
  ) {
    if (found(day)) return day.toISOString();
  }
  return null;
}
