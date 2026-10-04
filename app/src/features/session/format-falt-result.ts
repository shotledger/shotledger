// One rendering of a fält result for every screen that shows one (#513): a
// poängfält round reads as a points sum (D.6.11 p. 95), any other as hits in
// figures.
import type { TFunction } from 'i18next';
import type { FaltResultMode } from '@shotledger/shared';

export interface FaltResultSummary {
  mode: FaltResultMode;
  hits: number;
  figuresHit: number;
  poangfaltPoints: number;
}

/** A session's stored mode; `null` (not asked, or a pre-mode session) is plain fält. */
export function faltModeOf(stored: FaltResultMode | null | undefined): FaltResultMode {
  return stored === 'poangfalt' ? 'poangfalt' : 'falt';
}

/** The row-sized summary of a session's fält result, in the session's own mode. */
export function faltSummaryOf(
  storedMode: FaltResultMode | null | undefined,
  result: Omit<FaltResultSummary, 'mode'>,
): FaltResultSummary {
  return {
    mode: faltModeOf(storedMode),
    hits: result.hits,
    figuresHit: result.figuresHit,
    poangfaltPoints: result.poangfaltPoints,
  };
}

/** "47 points", or "26 hits in 22 figures". */
export function formatFaltResult(t: TFunction, result: FaltResultSummary): string {
  return result.mode === 'poangfalt'
    ? t('session.poangfaltTotal', { points: result.poangfaltPoints })
    : t('session.faltTotal', { hits: result.hits, figures: result.figuresHit });
}

/** One station as its row reads: "6/3 of 4, 12p of 20p" (#567). */
export function formatStation(
  t: TFunction,
  station: {
    hits: number;
    figuresHit: number;
    figureCount: number | null;
    points: number | null;
    pointsMax: number | null;
  },
): string {
  const figures =
    station.figureCount === null
      ? `${station.hits}/${station.figuresHit}`
      : t('station.rowFiguresOf', {
          hits: station.hits,
          figuresHit: station.figuresHit,
          figureCount: station.figureCount,
        });
  if (station.points === null) return figures;
  const points =
    station.pointsMax === null
      ? t('station.rowPoints', { points: station.points })
      : t('station.rowPointsOf', { points: station.points, max: station.pointsMax });
  return `${figures}, ${points}`;
}
