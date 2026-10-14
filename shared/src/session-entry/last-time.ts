// "Last time" while entering a series (#822; design review, benchmarks:
// "previous result in context while entering"): the matching series of the
// previous session of the same discipline. Pure, so the phone's series entry
// and the web's Enter Series read it from their own rows the same way.
//
// "Matching" is the Nth scored series of the same section (main round or
// final), not the raw position: a sighter at position 1 last time and none
// today would otherwise compare series 2 with series 1. A sighter is never
// compared, and two sessions scored differently (integer against decimal)
// are not comparable, so neither answers.

export interface LastTimeSession {
  id: string;
  disciplineId: string;
  /** ISO-8601. */
  startedAt: string;
  decimalScoring: boolean;
}

export interface LastTimeSeries {
  position: number;
  isSighter: boolean;
  isFinal: boolean;
  totalTenths: number;
  /** Null for a series stored as a total only (an import), which has no shot flags. */
  innerTens: number | null;
}

/**
 * The session shot just before `current` in the same discipline and scoring
 * mode: the latest `startedAt` strictly before it. Pass live series-kind
 * sessions only.
 */
export function previousSessionOf<T extends LastTimeSession>(
  sessions: Iterable<T>,
  current: LastTimeSession,
): T | null {
  let best: T | null = null;
  for (const session of sessions) {
    if (session.id === current.id) continue;
    if (session.disciplineId !== current.disciplineId) continue;
    if (session.decimalScoring !== current.decimalScoring) continue;
    if (!(session.startedAt < current.startedAt)) continue;
    if (best === null || session.startedAt > best.startedAt) best = session;
  }
  return best;
}

/**
 * Which scored series of its section this one is, 1-based: the scored series
 * of the same section at or before `position`. `others` are the session's
 * other series (the one being entered left out); null for a sighter.
 */
export function scoredOrdinal(
  others: readonly Pick<LastTimeSeries, 'position' | 'isSighter' | 'isFinal'>[],
  current: Pick<LastTimeSeries, 'position' | 'isSighter' | 'isFinal'>,
): number | null {
  if (current.isSighter) return null;
  const before = others.filter(
    (series) =>
      !series.isSighter && series.isFinal === current.isFinal && series.position < current.position,
  ).length;
  return before + 1;
}

/** The `ordinal`-th scored series of the section in a previous session, or null. */
export function seriesAtOrdinal(
  series: readonly LastTimeSeries[],
  ordinal: number | null,
  isFinal: boolean,
): LastTimeSeries | null {
  if (ordinal === null) return null;
  const scored = series
    .filter((row) => !row.isSighter && row.isFinal === isFinal)
    .sort((a, b) => a.position - b.position);
  return scored[ordinal - 1] ?? null;
}
