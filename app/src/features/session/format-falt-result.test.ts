import type { TFunction } from 'i18next';

import { faltModeOf, formatFaltResult, formatStation } from './format-falt-result';

const t = ((key: string, options: Record<string, number>) =>
  key === 'session.poangfaltTotal'
    ? `${options.points} points`
    : `${options.hits} hits in ${options.figures} figures`) as unknown as TFunction;

const result = { hits: 41, figuresHit: 34, poangfaltPoints: 75 };

describe('formatFaltResult', () => {
  it('a poängfält round reads as its points sum', () => {
    expect(formatFaltResult(t, { ...result, mode: 'poangfalt' })).toBe('75 points');
  });

  it('a fält round reads as hits in figures', () => {
    expect(formatFaltResult(t, { ...result, mode: 'falt' })).toBe('41 hits in 34 figures');
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
