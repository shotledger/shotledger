import i18n from '@/i18n';
import { DEFAULT_ANALYTICS_FILTER } from '@shotledger/shared';

import {
  clearStatsFilters,
  formatSignedDelta,
  periodLabel,
  removeStatsFilter,
  statsFilterChips,
} from './stats-filters';

const t = i18n.getFixedT('en');
const tags = [
  { id: 't1', name: 'Club match' },
  { id: 't2', name: 'Grip work' },
];

describe('statsFilterChips', () => {
  it('has no chip for the default filter: the period is in the subtitle', () => {
    expect(statsFilterChips(t, DEFAULT_ANALYTICS_FILTER, tags)).toEqual([]);
    expect(statsFilterChips(t, { ...DEFAULT_ANALYTICS_FILTER, period: 'all' }, tags)).toEqual([]);
  });

  it('names every filter that is set, in the sheet order', () => {
    const filter = {
      ...DEFAULT_ANALYTICS_FILTER,
      sessionType: 'competition' as const,
      disciplineId: 'spsf-precision',
      shotsPerSeries: 5,
      includeSighters: false,
      tagIds: ['t2'],
    };
    expect(statsFilterChips(t, filter, tags).map((chip) => chip.label)).toEqual([
      'Competition',
      'Precision',
      '5-shot series',
      'Sighters excluded',
      'Grip work',
    ]);
  });
});

describe('removeStatsFilter', () => {
  const filter = {
    ...DEFAULT_ANALYTICS_FILTER,
    period: '12m' as const,
    sessionType: 'training' as const,
    disciplineId: 'spsf-precision',
    shotsPerSeries: 5,
    includeSighters: false,
    tagIds: ['t1', 't2'],
  };

  it('puts one setting back at its default and leaves the rest', () => {
    expect(removeStatsFilter(filter, 'tag:t1').tagIds).toEqual(['t2']);
    expect(removeStatsFilter(filter, 'type').sessionType).toBeNull();
    expect(removeStatsFilter(filter, 'discipline')).toEqual({ ...filter, disciplineId: null });
    expect(removeStatsFilter(filter, 'shotsPerSeries').shotsPerSeries).toBeNull();
    expect(removeStatsFilter(filter, 'sighters').includeSighters).toBe(true);
    expect(removeStatsFilter(filter, 'unknown')).toBe(filter);
  });

  it('clears every chip but keeps the period', () => {
    expect(clearStatsFilters(filter)).toEqual({ ...DEFAULT_ANALYTICS_FILTER, period: '12m' });
  });
});

describe('periodLabel', () => {
  it('says the period in words', () => {
    const day = (d: string) => d;
    expect(periodLabel(t, DEFAULT_ANALYTICS_FILTER, day)).toBe('Last 6 months');
    expect(periodLabel(t, { ...DEFAULT_ANALYTICS_FILTER, period: 'all' }, day)).toBe('All time');
    expect(
      periodLabel(
        t,
        { ...DEFAULT_ANALYTICS_FILTER, period: 'custom', customFrom: '2026-09-01', customTo: null },
        day,
      ),
    ).toBe('2026-09-01 – …');
  });
});

describe('formatSignedDelta', () => {
  it('signs a change and calls a rounded zero even', () => {
    expect(formatSignedDelta(0.84, 1)).toBe('+0.8');
    expect(formatSignedDelta(-1.25, 1)).toBe('−1.3');
    expect(formatSignedDelta(0.04, 1)).toBe('±0.0');
  });
});
