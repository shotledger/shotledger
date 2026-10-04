import type { TFunction } from 'i18next';

import { faltModeOf, formatFaltResult } from './format-falt-result';

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
