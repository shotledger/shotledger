// Fältskjutning result model — SHB 2026 Del D, verified in
// docs/reference/spsf-shb-2026.md ("Fältskjutning"). Executable spec:
// docs/specs/falt-scoring-spec.md.
//
// Fält is not a ring sport: a station yields a hit count, a hit-figure count
// and — only where the arrangör designated a poängmål — points read off that
// figure's rings. Nothing is scored per shot, because holes are counted per
// figure after the series and nobody can attribute a hole to a shot number.

/** Six shots at every station — D.6.4 p. 91 ("skall antalet skott vara sex"). */
export const SHOTS_PER_STATION = 6;

/** One skjutstation's result. `points` is null when the station had no poängmål. */
export interface FaltStation {
  hits: number;
  figuresHit: number;
  points: number | null;
}

/**
 * How the competition presents and ranks the result (D.6.11 p. 95): vanlig
 * fält as "antal träff i antal figurer", poängfält as one sum. The same event
 * can be held either way, so this belongs to the competition, not the
 * discipline.
 */
export type FaltResultMode = 'falt' | 'poangfalt';

export interface FaltRoundResult {
  stationCount: number;
  hits: number;
  figuresHit: number;
  /** Poängmål total; null when no station carried one. Never a tie-break of its own — see compareFaltResults. */
  ringedFigurePoints: number | null;
}

function assertStation(station: FaltStation, index: number): void {
  const where = `station ${index + 1}`;
  const { hits, figuresHit, points } = station;
  if (!Number.isInteger(hits) || hits < 0 || hits > SHOTS_PER_STATION) {
    throw new RangeError(`${where}: hits must be an integer 0-${SHOTS_PER_STATION}, got ${hits}`);
  }
  if (!Number.isInteger(figuresHit) || figuresHit < 0 || figuresHit > hits) {
    throw new RangeError(`${where}: figuresHit must be an integer 0-${hits}, got ${figuresHit}`);
  }
  // Every hit is a hole in some figure's målyta (D.6.10.1 p. 93), so hits
  // without a hit figure is not a bad station — it is bad data.
  if (hits > 0 && figuresHit === 0) {
    throw new RangeError(`${where}: ${hits} hits cannot be spread over 0 figures`);
  }
  if (points !== null && (!Number.isInteger(points) || points < 0)) {
    throw new RangeError(`${where}: points must be a non-negative integer or null, got ${points}`);
  }
}

/** A round's totals. Throws on a station that cannot have happened. */
export function faltResult(stations: readonly FaltStation[]): FaltRoundResult {
  let hits = 0;
  let figuresHit = 0;
  let ringedFigurePoints: number | null = null;

  stations.forEach((station, index) => {
    assertStation(station, index);
    hits += station.hits;
    figuresHit += station.figuresHit;
    if (station.points !== null) ringedFigurePoints = (ringedFigurePoints ?? 0) + station.points;
  });

  return { stationCount: stations.length, hits, figuresHit, ringedFigurePoints };
}

/**
 * The poängfält sum: one point per hit and one per hit figure (D.6.11 p. 95).
 * A poängmål's ring points are a separate quantity and stay out of it.
 */
export function poangfaltPoints(result: Pick<FaltRoundResult, 'hits' | 'figuresHit'>): number {
  return result.hits + result.figuresHit;
}

function stationValue(station: FaltStation, mode: FaltResultMode): number {
  return mode === 'falt' ? station.hits : station.hits + station.figuresHit;
}

/**
 * Countback (D.6.11.2.1.1 step 3 / D.6.11.2.1.2 step 2): most on the last
 * station, then the next-to-last. Rounds of different lengths are aligned
 * from the last station, and the comparison stops where the shorter one runs
 * out rather than ranking on a station the other round never shot.
 */
function compareCountback(
  a: readonly FaltStation[],
  b: readonly FaltStation[],
  mode: FaltResultMode,
): number {
  const depth = Math.min(a.length, b.length);
  for (let back = 1; back <= depth; back += 1) {
    const difference =
      stationValue(b[b.length - back]!, mode) - stationValue(a[a.length - back]!, mode);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * SHB's särskiljning order, as a comparator: negative when `a` ranks ahead of
 * `b`, so `sort` puts the best round first. 0 means SHB cannot separate them
 * from the rounds alone — they share the placement, or (for the medal places)
 * a särskjutning is shot, which this module does not model.
 *
 * Vanlig fält (D.6.11.2.1.1 p. 95): hits, figures hit, poängmål points,
 * countback on hits. Poängfält (D.6.11.2.1.2 p. 96): points (hits + figures),
 * poängmål points, countback on hits + figures.
 *
 * A round with no poängmål compares as 0 points, so it neither gains nor
 * loses against one that shot a designated figure and scored nothing.
 *
 * @Requirements SCORE_004
 */
export function compareFaltResults(
  a: readonly FaltStation[],
  b: readonly FaltStation[],
  mode: FaltResultMode,
): number {
  const left = faltResult(a);
  const right = faltResult(b);

  if (mode === 'falt') {
    if (right.hits !== left.hits) return right.hits - left.hits;
    if (right.figuresHit !== left.figuresHit) return right.figuresHit - left.figuresHit;
  } else {
    const leftPoints = poangfaltPoints(left);
    const rightPoints = poangfaltPoints(right);
    if (rightPoints !== leftPoints) return rightPoints - leftPoints;
  }

  const leftRinged = left.ringedFigurePoints ?? 0;
  const rightRinged = right.ringedFigurePoints ?? 0;
  if (rightRinged !== leftRinged) return rightRinged - leftRinged;

  return compareCountback(a, b, mode);
}

/** `compareFaltResults` bound to a mode, for `rounds.sort(byFalt('falt'))`. */
export function byFalt(
  mode: FaltResultMode,
): (a: readonly FaltStation[], b: readonly FaltStation[]) => number {
  return (a, b) => compareFaltResults(a, b, mode);
}
