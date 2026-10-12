import i18next, { type TFunction } from 'i18next';

import en from '@/i18n/en.json';
import sv from '@/i18n/sv.json';

import { faltModeOf, formatFaltResult, formatStation } from './format-falt-result';

const i18n = i18next.createInstance();
let t: TFunction;
let tSv: TFunction;

beforeAll(async () => {
  await i18n.init({
    resources: { en: { translation: en }, sv: { translation: sv } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  t = i18n.getFixedT('en');
  tSv = i18n.getFixedT('sv');
});

// Eight scoring stations: 48 hits possible.
const result = { hits: 41, hitsPossible: 48, figuresHit: 34, poangfaltPoints: 75 };

describe('formatFaltResult', () => {
  it('a poängfält round reads as its points sum', () => {
    expect(formatFaltResult(t, { ...result, mode: 'poangfalt' })).toBe('75 points');
    expect(formatFaltResult(tSv, { ...result, mode: 'poangfalt' })).toBe('75 poäng');
  });

  it('a fält round reads as hits of possible, then figures hit (#670)', () => {
    expect(formatFaltResult(t, { ...result, mode: 'falt' })).toBe('41 (48) hits / 34 figures');
    expect(formatFaltResult(tSv, { ...result, mode: 'falt' })).toBe('41 (48) träff / 34 figurer');
  });

  it('a fält round with a figure count adds it beside the figures hit (#607, #670)', () => {
    expect(formatFaltResult(t, { ...result, mode: 'falt', figureCount: 40 })).toBe(
      '41 (48) hits / 34 (40) figures',
    );
    expect(formatFaltResult(tSv, { ...result, mode: 'falt', figureCount: 40 })).toBe(
      '41 (48) träff / 34 (40) figurer',
    );
  });

  it('a fält round without a figure count keeps the plain figures (#607)', () => {
    expect(formatFaltResult(t, { ...result, mode: 'falt', figureCount: null })).toBe(
      '41 (48) hits / 34 figures',
    );
  });

  it('a round with no scoring station says so instead of reading as nought', () => {
    const empty = { hits: 0, hitsPossible: 0, figuresHit: 0, poangfaltPoints: 0 };
    expect(formatFaltResult(t, { ...empty, mode: 'falt' })).toBe('No stations');
    expect(formatFaltResult(tSv, { ...empty, mode: 'falt' })).toBe('Inga stationer');
    expect(formatFaltResult(t, { ...empty, mode: 'poangfalt' })).toBe('No stations');
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
