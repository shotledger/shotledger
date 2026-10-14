// A forward scan over the instants at which a windowed count can change.
// Shared by the lapse (#795) and the shortfall (#804). Spec:
// docs/specs/compliance-next-session-spec.md "How it is computed".
import { subtractMonthsUtc } from './months';

const DAY_MS = 86_400_000;

/**
 * The first candidate instant after `nowMs` at which `found` is true, as ISO,
 * or `null` if there is none before the horizon.
 *
 * `found` must be decided by comparing the instants in `times` with `t` and
 * with `subtractMonthsUtc(t, k)` for `k` in `edgeMonths`. Within one UTC day
 * such an edge is that day's month-shifted midnight plus `t`'s time of day, so
 * it passes an instant exactly one millisecond after reaching it; across
 * midnight it can jump (May 1 − 1 month is Apr 1, Apr 30 − 1 month is Mar 30,
 * Apr 1 − 1 month is Mar 1 after Mar 31 − 1 month was Mar 3). Between those
 * instants every comparison is constant, so they are the only ones evaluated.
 * An instant entering a window at its newest end does so at the instant
 * itself, and is therefore not a candidate: `found` must not become true by
 * that alone.
 *
 * Past the horizon every instant in `times` is behind every edge for good: an
 * edge is never more than 31 days a month behind `t`.
 *
 * @Requirements COMPL_003
 */
export function firstInstantWhere(
  times: readonly number[],
  edgeMonths: readonly number[],
  nowMs: number,
  found: (t: Date) => boolean,
): string | null {
  const reachMs = Math.max(...edgeMonths) * 31 * DAY_MS;
  const horizonMs = times.reduce((a, b) => Math.max(a, b), nowMs) + reachMs + DAY_MS;

  const day = new Date(nowMs);
  day.setUTCHours(0, 0, 0, 0);
  for (let dayMs = day.getTime(); dayMs < horizonMs; dayMs += DAY_MS) {
    const candidates = [dayMs];
    for (const k of edgeMonths) {
      const edgeMs = subtractMonthsUtc(new Date(dayMs), k).getTime();
      for (const ms of times) {
        // The edge reaches this instant today when it is within a day ahead.
        const offset = ms - edgeMs;
        if (Math.floor(offset / DAY_MS) === 0) candidates.push(dayMs + offset + 1);
      }
    }
    const hit = candidates
      .filter((ms) => ms > nowMs)
      .sort((a, b) => a - b)
      .find((ms) => found(new Date(ms)));
    if (hit !== undefined) return new Date(hit).toISOString();
  }
  return null;
}
