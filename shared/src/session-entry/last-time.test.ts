import { describe, expect, it } from 'vitest';

import {
  previousSessionOf,
  scoredOrdinal,
  seriesAtOrdinal,
  type LastTimeSeries,
} from './last-time';

const session = (
  id: string,
  startedAt: string,
  extra: Partial<{ disciplineId: string; decimalScoring: boolean }> = {},
) => ({
  id,
  disciplineId: 'spsf-precision',
  startedAt,
  decimalScoring: false,
  ...extra,
});

describe('previousSessionOf', () => {
  const current = session('now', '2026-10-10T10:00:00.000Z');

  it('takes the latest session strictly before this one', () => {
    const sessions = [
      session('old', '2026-09-01T10:00:00.000Z'),
      session('prev', '2026-10-01T10:00:00.000Z'),
      session('later', '2026-10-12T10:00:00.000Z'),
      current,
    ];
    expect(previousSessionOf(sessions, current)?.id).toBe('prev');
  });

  it('skips another discipline and another scoring mode', () => {
    const sessions = [
      session('other', '2026-10-09T10:00:00.000Z', { disciplineId: 'spsf-milsnabb' }),
      session('decimal', '2026-10-08T10:00:00.000Z', { decimalScoring: true }),
      session('match', '2026-10-01T10:00:00.000Z'),
    ];
    expect(previousSessionOf(sessions, current)?.id).toBe('match');
  });

  it('is null for the first session of a discipline', () => {
    expect(previousSessionOf([current], current)).toBeNull();
  });
});

describe('scoredOrdinal', () => {
  const rows = [
    { position: 1, isSighter: true, isFinal: false },
    { position: 2, isSighter: false, isFinal: false },
    { position: 3, isSighter: false, isFinal: false },
    { position: 5, isSighter: false, isFinal: true },
  ];

  it('counts the scored series of the section before it', () => {
    expect(scoredOrdinal(rows, { position: 4, isSighter: false, isFinal: false })).toBe(3);
    expect(scoredOrdinal(rows, { position: 6, isSighter: false, isFinal: true })).toBe(2);
  });

  it('is null for a sighter', () => {
    expect(scoredOrdinal(rows, { position: 4, isSighter: true, isFinal: false })).toBeNull();
  });
});

describe('seriesAtOrdinal', () => {
  const previous: LastTimeSeries[] = [
    { position: 3, isSighter: false, isFinal: false, totalTenths: 440, innerTens: 2 },
    { position: 1, isSighter: true, isFinal: false, totalTenths: 380, innerTens: 0 },
    { position: 2, isSighter: false, isFinal: false, totalTenths: 410, innerTens: 0 },
    { position: 4, isSighter: false, isFinal: true, totalTenths: 450, innerTens: null },
  ];

  it('finds the Nth scored series of the section, sighters left out', () => {
    expect(seriesAtOrdinal(previous, 1, false)?.totalTenths).toBe(410);
    expect(seriesAtOrdinal(previous, 2, false)?.totalTenths).toBe(440);
    expect(seriesAtOrdinal(previous, 1, true)?.totalTenths).toBe(450);
  });

  it('is null past the end, or for no ordinal', () => {
    expect(seriesAtOrdinal(previous, 3, false)).toBeNull();
    expect(seriesAtOrdinal(previous, null, false)).toBeNull();
  });
});
