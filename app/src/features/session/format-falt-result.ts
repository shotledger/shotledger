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
  /** The round's figures, when every scoring station recorded a count (#607). */
  figureCount?: number | null;
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
    figureCount: result.figureCount ?? null,
  };
}

/** "47 points", "26 hits in 22 figures", or "26 hits in 22 of 24 figures". */
export function formatFaltResult(t: TFunction, result: FaltResultSummary): string {
  if (result.mode === 'poangfalt') {
    return t('session.poangfaltTotal', { points: result.poangfaltPoints });
  }
  return result.figureCount == null
    ? t('session.faltTotal', { hits: result.hits, figures: result.figuresHit })
    : t('session.faltTotalOf', {
        hits: result.hits,
        figures: result.figuresHit,
        figureCount: result.figureCount,
      });
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
