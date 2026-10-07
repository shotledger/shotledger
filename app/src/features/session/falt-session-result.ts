// A session's fält result from its stations, free of the database so the web
// app (ADR 0013) reads the same numbers from pulled rows.
import {
  faltResult,
  poangfaltPoints,
  scoringStations,
  SHOTS_PER_STATION,
  type FaltStationEntry,
} from '@shotledger/shared';

export interface FaltSessionResult {
  stationCount: number;
  hits: number;
  figuresHit: number;
  /** Poängmål points over the scoring stations; null when none carried one. */
  ringedFigurePoints: number | null;
  /** One point per hit plus one per hit figure (D.6.11 p. 95). */
  poangfaltPoints: number;
  /** What those poängmål could have given, for an "X of Y" reading; null when none. */
  pointsMax: number | null;
  /** Figures over the scoring stations; null unless every one of them recorded a count (#607). */
  figureCount: number | null;
  /** Six per scoring station (D.6.4 p. 91): the "(XT)" in "X (XT) hits" (#670). */
  hitsPossible: number;
}

export interface FaltResultStation extends FaltStationEntry {
  pointsMax: number | null;
  figureCount: number | null;
}

/** The result over the stations that actually score, in the order given. */
export function faltSessionResultOf(stations: readonly FaltResultStation[]): FaltSessionResult {
  const result = faltResult(scoringStations(stations));
  const scoringRows = stations.filter((row) => !row.isScratched && !row.isShootOff);

  // The max is summed over the same stations the points came from, so an
  // excluded station takes its poängmål with it in both directions.
  let pointsMax: number | null = null;
  for (const row of scoringRows) {
    if (row.pointsMax != null) pointsMax = (pointsMax ?? 0) + row.pointsMax;
  }

  const figureCount =
    scoringRows.length > 0 && scoringRows.every((row) => row.figureCount != null)
      ? scoringRows.reduce((sum, row) => sum + row.figureCount!, 0)
      : null;

  return {
    ...result,
    poangfaltPoints: poangfaltPoints(result),
    pointsMax,
    figureCount,
    hitsPossible: result.stationCount * SHOTS_PER_STATION,
  };
}
