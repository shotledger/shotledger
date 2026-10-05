import type { TFunction } from 'i18next';

import { faltModeOf, formatFaltResult, formatStation } from './format-falt-result';

const t = ((key: string, options: Record<string, number>) =>
  ({
    'session.poangfaltTotal': `${options.points} points`,
    'session.faltTotal': `${options.hits} hits in ${options.figures} figures`,
    'session.faltTotalOf': `${options.hits} hits in ${options.figures} of ${options.figureCount} figures`,
  })[key]) as unknown as TFunction;

const result = { hits: 41, figuresHit: 34, poangfaltPoints: 75 };

describe('formatFaltResult', () => {
  it('a poängfält round reads as its points sum', () => {
    expect(formatFaltResult(t, { ...result, mode: 'poangfalt' })).toBe('75 points');
  });

  it('a fält round reads as hits in figures', () => {
    expect(formatFaltResult(t, { ...result, mode: 'falt' })).toBe('41 hits in 34 figures');
  });

  it('a fält round with a figure count reads as hits in figures of the count (#607)', () => {
    expect(formatFaltResult(t, { ...result, mode: 'falt', figureCount: 40 })).toBe(
      '41 hits in 34 of 40 figures',
    );
  });

  it('a fält round without a figure count keeps the plain reading (#607)', () => {
    expect(formatFaltResult(t, { ...result, mode: 'falt', figureCount: null })).toBe(
      '41 hits in 34 figures',
    );
  });

  it('a poängfält round ignores the figure count', () => {
    expect(formatFaltResult(t, { ...result, mode: 'poangfalt', figureCount: 40 })).toBe(
      '75 points',
    );
  });
});

describe('faltModeOf', () => {
  it('keeps poängfält', () => {
    expect(faltModeOf('poangfalt')).toBe('poangfalt');
  });

  it('treats fält and an unset mode as fält', () => {
    expect(faltModeOf('falt')).toBe('falt');
    expect(faltModeOf(null)).toBe('falt');
    expect(faltModeOf(undefined)).toBe('falt');
  });
});

describe('formatStation (#567)', () => {
  const st = ((key: string, o: Record<string, number>) =>
    ({
      'station.rowFiguresOf': `${o.hits}/${o.figuresHit} of ${o.figureCount}`,
      'station.rowPoints': `${o.points}p`,
      'station.rowPointsOf': `${o.points}p of ${o.max}p`,
    })[key]) as unknown as TFunction;
  const station = { hits: 6, figuresHit: 3, figureCount: 4, points: 12, pointsMax: 20 };

  it('reads hits, figures of the figure count, and points of the max', () => {
    expect(formatStation(st, station)).toBe('6/3 of 4, 12p of 20p');
  });

  it('leaves out what was not recorded', () => {
    expect(formatStation(st, { ...station, points: null, pointsMax: null })).toBe('6/3 of 4');
    expect(formatStation(st, { ...station, figureCount: null, points: null })).toBe('6/3');
    expect(formatStation(st, { ...station, pointsMax: null })).toBe('6/3 of 4, 12p');
  });
});
